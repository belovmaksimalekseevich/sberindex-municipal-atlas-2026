const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const checks = [];

function check(name, run) { run(); checks.push(name); }
function load(file, modules, globals = {}, suppliedSource) {
  const source = (suppliedSource ?? fs.readFileSync(file, 'utf8')).replaceAll('import.meta.url', "'file:///fixture/workerHost.ts'");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const sandbox = { exports: {}, require: name => {
    if (!(name in modules)) throw new Error('Unexpected import ' + name);
    return modules[name];
  }, URL, ...globals };
  vm.runInNewContext(code, sandbox, { filename: file });
  return sandbox.exports;
}

function workerFixture(mode = 'normal') {
  const workers = [], notices = [], pathSets = [];
  class Worker {
    constructor() {
      if (mode === 'constructor') throw new Error('blocked resource');
      this.sent = []; workers.push(this);
    }
    postMessage(message) {
      if (mode === 'initialPost' || this.failPost) throw new Error('clone failed');
      this.sent.push(message);
    }
    terminate() { this.terminated = true; }
  }
  const api = load(path.join(root, 'src/landing/nat/workerHost.ts'), {
    react: { useSyncExternalStore: (subscribe, snapshot) => { subscribe(() => notices.push(snapshot())); return snapshot(); } },
    './natdata': { MAP: { paths: {}, out: '' } },
    './sceneCore': { setMapPaths: (...args) => pathSets.push(args) },
  }, { Worker: mode === 'unsupported' ? undefined : Worker, OffscreenCanvas: class {}, ImageBitmap: class {}, HTMLCanvasElement: { prototype: { transferControlToOffscreen() {} } } });
  api.useWorkerFailed();
  return { api, workers, notices, pathSets };
}

for (const mode of ['constructor', 'initialPost', 'unsupported']) {
  const f = workerFixture(mode);
  check(mode + ' returns local without throwing', () => assert.equal(f.api.canvasWorker(), null));
  check(mode + ' does not recreate failed worker', () => { f.api.canvasWorker(); assert.ok(f.workers.length <= 1); });
}
for (const event of ['onerror', 'onmessageerror']) {
  const f = workerFixture(); const worker = f.api.canvasWorker();
  let called = 0;
  f.api.requestBitmap({ type: 'map' }, () => called++);
  f.api.requestBitmap({ type: 'net' }, () => called++);
  const deliver = worker.onmessage;
  worker[event]({});
  check(event + ' terminates once, notifies and switches local', () => {
    assert.equal(worker.terminated, true); assert.equal(f.api.canvasWorker(), null); assert.deepEqual(f.notices, [true]);
  });
  let closed = 0;
  deliver({ data: { type: 'map', req: 1, bmp: { close() { closed++; } } } });
  check(event + ' clears pending and disposes stale bitmap', () => { assert.equal(called, 0); assert.equal(closed, 1); });
  check(event + ' later send cannot revive worker', () => { assert.equal(f.api.toWorker({ type: 'paths' }), false); assert.equal(f.workers.length, 1); });
}
{
  const f = workerFixture(); const worker = f.api.canvasWorker(); worker.failPost = true;
  f.api.requestBitmap({ type: 'map' }, () => assert.fail('failed send delivered'));
  check('postMessage exception triggers local fallback', () => { assert.equal(f.api.canvasWorker(), null); assert.equal(worker.terminated, true); });
}
{
  const f = workerFixture(); const worker = f.api.canvasWorker(); let received = 0, closed = 0;
  const first = f.api.requestBitmap({ type: 'map' }, () => received++);
  worker.onmessage({ data: { type: 'map', req: first, bmp: { close() { closed++; } } } });
  const next = f.api.requestBitmap({ type: 'net' }, () => received++); f.api.cancelBitmap(next);
  worker.onmessage({ data: { type: 'map', req: next, bmp: { close() { closed++; } } } });
  check('successful response and cancellation preserve request identities', () => { assert.equal(received, 1); assert.equal(closed, 1); });
  f.api.showBitmap({ getContext: () => null }, { close() { closed++; } });
  check('missing bitmaprenderer disables worker safely', () => { assert.equal(f.api.canvasWorker(), null); assert.equal(closed, 2); });
  f.api.ensureLocalPaths(); f.api.ensureLocalPaths();
  check('local paths initialized once', () => assert.equal(f.pathSets.length, 1));
}

async function dataFixture() {
  const timers = [], errors = [], responses = new Map();
  const names = load(path.join(root, 'src/landing/displayNames.ts'), {});
  const base = JSON.parse(fs.readFileSync(path.join(root, 'src/landing/i26/base.json'), 'utf8'));
  const lead = JSON.parse(fs.readFileSync(path.join(root, 'src/landing/i26/lead.json'), 'utf8'));
  const leadNet = JSON.parse(fs.readFileSync(path.join(root, 'src/landing/i26/leadnet.json'), 'utf8'));
  const dataFile = path.join(root, 'src/landing/data.ts');
  const source = fs.readFileSync(dataFile, 'utf8').replaceAll('import.meta.env.DEV', 'false');
  const api = load(dataFile, {
    react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
    './i26/base.json': base, './i26/lead.json': lead, './i26/leadnet.json': leadNet, './displayNames': names,
  }, {
    fetch: url => { const key = new URL(url).pathname.split('/').at(-1).replace('.json', ''); return Promise.resolve(responses.get(key)); },
    setTimeout: callback => timers.push(callback), requestAnimationFrame: callback => timers.push(callback),
  }, source);
  async function drain() {
    for (let pass = 0; pass < 30; pass++) {
      await Promise.resolve();
      while (timers.length) { try { timers.shift()(); } catch (e) { errors.push(e.message); } }
    }
  }
  const valid = JSON.parse(fs.readFileSync(path.join(root, 'public-landing/i26/config/SSE_K06.json'), 'utf8'));
  responses.set('bad', { ok: true, json: () => ({ invalid: true }) });
  responses.set('good', { ok: true, json: () => valid });
  api.prefetch('bad'); api.prefetch('good'); await drain();
    check('malformed apply becomes explicit config error without global throw', () => { assert.equal(errors.length, 0); assert.equal(api.useConfig('bad', false).state, 'error'); });
    check('next model still loads after earlier apply error', () => assert.equal(api.useConfig('good', false).state, 'ready'));
    responses.set('bad', { ok: true, json: () => valid }); api.retry('bad'); await drain();
    check('retry replaces error only after successful application', () => assert.equal(api.useConfig('bad', false).state, 'ready'));
    responses.set('parse', { ok: true, json: () => Promise.reject(new SyntaxError('invalid JSON')) });
    api.prefetch('parse'); await drain();
    check('JSON parse rejection is visible', () => assert.equal(api.useConfig('parse', false).state, 'error'));
    responses.set('http', { ok: false, status: 503 }); api.prefetch('http'); await drain();
    check('HTTP failure retains error state', () => assert.equal(api.useConfig('http', false).state, 'error'));
    check('successful December display mapping retained', () => assert.equal(api.useConfig('good', false).data.find(month => month.month === '2024-12').clusters.find(group => group.g === 0).name, 'Повышенный уровень расходов'));
  responses.set('2023-01', { ok: false, status: 503 });
  api.prefetchNet('SSE_K06', '2023-01'); await drain();
  check('network HTTP failure is explicit', () => assert.equal(api.useNet('SSE_K06', '2023-01', false).state, 'error'));
  const net = JSON.parse(fs.readFileSync(path.join(root, 'public-landing/i26/net/shared_mixed/2023-01.json'), 'utf8'));
  responses.set('2023-01', { ok: true, json: () => net }); api.retryNet('SSE_K06', '2023-01'); await drain();
  check('network retry restores saved network', () => assert.equal(api.useNet('SSE_K06', '2023-01', false).data, net));
  check('same-month models share the intended graph cache', () => assert.equal(api.useNet('SSE_K10', '2023-01', false).data, net));
}

(async () => {
  await dataFixture();
  console.log(JSON.stringify({ passed: true, checks: checks.length, names: checks, scope: 'Actual TS host/data behavior with Worker/timer doubles and saved repository data. No files written, browser, network or model fitting.', new_fits: 0 }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
