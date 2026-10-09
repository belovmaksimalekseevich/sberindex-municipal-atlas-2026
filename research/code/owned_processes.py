"""Track owned descendants across sessions; Linux signals use stable pidfds.

Linux execution remains held until these paths have actual Linux acceptance.
Windows checks exercise only their own psutil path, never prove Linux cleanup.
"""
import ctypes
import os
from pathlib import Path
import platform
import signal
import time


class OwnedProcesses:
    def __init__(self):
        import psutil
        self.psutil = psutil
        self.linux = platform.system() == "Linux"
        self.parent = os.getpid()
        self.owners = {}
        self.retired = []
        self.leader = None
        self.prior_subreaper = None
        # Single child owner: newly adopted direct children can only come from this stage.
        if psutil.Process().children(recursive=True):
            raise RuntimeError("guardian requires exclusive child ownership")
        if self.linux:
            if not hasattr(os, "pidfd_open") or not hasattr(signal, "pidfd_send_signal"):
                raise RuntimeError("stable Linux pidfd signaling required")
            self.boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
            self.libc = ctypes.CDLL(None, use_errno=True)
            prior = ctypes.c_int()
            if self.libc.prctl(37, ctypes.byref(prior), 0, 0, 0) != 0:
                raise OSError(ctypes.get_errno(), "PR_GET_CHILD_SUBREAPER")
            self.prior_subreaper = prior.value
            if self.libc.prctl(36, 1, 0, 0, 0) != 0:
                raise OSError(ctypes.get_errno(), "PR_SET_CHILD_SUBREAPER")

    @staticmethod
    def linux_stat(pid):
        fields = Path("/proc", str(pid), "stat").read_text().rsplit(")", 1)[1].split()
        return {"pid": pid, "state": fields[0], "ppid": int(fields[1]), "start_ticks": int(fields[19])}

    def capture(self, pid, expected_create_time=None):
        try:
            if expected_create_time is not None and self.psutil.Process(pid).create_time() != expected_create_time:
                raise RuntimeError("PID identity changed after descendant discovery")
            if self.linux:
                before = self.linux_stat(pid)
                if pid in self.owners and self.owners[pid]["start_ticks"] == before["start_ticks"]:
                    return
                fd = os.pidfd_open(pid, 0)
                try:
                    after = self.linux_stat(pid)
                    if before["start_ticks"] != after["start_ticks"]:
                        raise RuntimeError("PID reused during ownership capture")
                    if expected_create_time is not None and self.psutil.Process(pid).create_time() != expected_create_time:
                        raise RuntimeError("PID identity changed during pidfd capture")
                    if pid in self.owners:
                        old = self.owners[pid]
                        self.retired.append({k: v for k, v in old.items() if k != "fd"})
                        os.close(old["fd"])
                    self.owners[pid] = {"pid": pid, "start_ticks": after["start_ticks"], "boot_id": self.boot, "fd": fd}
                except BaseException:
                    os.close(fd)
                    raise
            else:
                proc = self.psutil.Process(pid)
                created = proc.create_time()
                if pid in self.owners and self.owners[pid]["create_time"] != created:
                    self.retired.append(self.owners[pid])
                self.owners[pid] = {"pid": pid, "create_time": created}
        except (self.psutil.NoSuchProcess, ProcessLookupError, FileNotFoundError):
            pass

    def same_alive(self, owner):
        try:
            if self.linux:
                current = self.linux_stat(owner["pid"])
                return current["start_ticks"] == owner["start_ticks"] and current["state"] not in ["Z", "X"]
            proc = self.psutil.Process(owner["pid"])
            return proc.create_time() == owner["create_time"] and proc.status() != self.psutil.STATUS_ZOMBIE
        except (self.psutil.NoSuchProcess, ProcessLookupError, FileNotFoundError):
            return False

    def same_present(self, owner):
        """Zombies still require reaping and must not count as absent."""
        try:
            if self.linux:
                return self.linux_stat(owner["pid"])["start_ticks"] == owner["start_ticks"]
            return self.psutil.Process(owner["pid"]).create_time() == owner["create_time"]
        except (self.psutil.NoSuchProcess, ProcessLookupError, FileNotFoundError):
            return False

    def attach(self, process):
        self.leader = process
        self.capture(process.pid)
        self.refresh()

    def refresh(self):
        # The Linux subreaper adopts orphaned/double-forked workers, even when setsid
        # disconnected their process groups from the original runner.
        for proc in self.psutil.Process(self.parent).children(recursive=True):
            self.capture(proc.pid, proc.create_time())
        rss = 0
        for owner in self.owners.values():
            if self.same_alive(owner):
                try:
                    proc = self.psutil.Process(owner["pid"])
                    rss += proc.memory_info().rss
                except self.psutil.NoSuchProcess:
                    pass
        return rss

    def send(self, owner, sig):
        if not self.same_alive(owner):
            return False
        try:
            if self.linux:
                # The fd targets the captured kernel process; PID reuse cannot redirect it.
                signal.pidfd_send_signal(owner["fd"], sig)
            else:
                proc = self.psutil.Process(owner["pid"])
                if proc.create_time() != owner["create_time"]:
                    return False
                proc.kill()
            return True
        except (self.psutil.NoSuchProcess, ProcessLookupError):
            return False

    def stop(self):
        if self.leader is None:
            return {"owners": [], "all_owned_absent": True}
        # Freeze known Linux owners before discovery, preventing more forks while
        # walking detached descendants. Re-scan adopted children after each kill.
        for _ in range(50):
            self.refresh()
            if self.linux:
                for owner in list(self.owners.values()):
                    self.send(owner, signal.SIGSTOP)
                self.refresh()
            for owner in reversed(list(self.owners.values())):
                self.send(owner, signal.SIGKILL if self.linux else signal.SIGTERM)
            try:
                self.leader.wait(timeout=0.1)
            except __import__("subprocess").TimeoutExpired:
                pass
            if self.linux:
                for pid in self.owners:
                    if pid != self.leader.pid:
                        try:
                            os.waitpid(pid, os.WNOHANG)
                        except ChildProcessError:
                            pass
            self.refresh()
            if not any(self.same_present(owner) for owner in self.owners.values()):
                return {"owners": self.retired + [{k: v for k, v in owner.items() if k != "fd"} for owner in self.owners.values()],
                        "all_owned_absent": True, "Linux_pidfds_and_subreaper": self.linux}
            time.sleep(0.1)
        raise RuntimeError("owned descendants remain after bounded cleanup")

    def close(self):
        for owner in self.owners.values():
            if "fd" in owner:
                os.close(owner["fd"])
        if self.linux and self.prior_subreaper is not None:
            if self.libc.prctl(36, self.prior_subreaper, 0, 0, 0) != 0:
                raise OSError(ctypes.get_errno(), "restore child subreaper")
