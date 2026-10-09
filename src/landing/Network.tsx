import { useEffect, useMemo, useRef, useState } from 'react'
import { T, clusterOf, rankColor, rub, type ConfigMonth, type Net } from './data'
import { layoutFor } from './layout'
import { ID_VIEW, cssColor, dprFor, drawNet, fitCanvas, nearest, type P } from './canvasNet'
import { cancelBitmap, canvasWorker, requestBitmap, showBitmap, useWorkerFailed } from './nat/workerHost'
import { scaleOf } from './zoom'

// связи сети как плоский массив (кэш на сеть): передаются в фоновый поток для рисования
const edgeArr = new WeakMap<Net, Int32Array>()
const edgesOf = (net: Net) => { let a = edgeArr.get(net); if (!a) { a = new Int32Array(2 * net.edges.length); net.edges.forEach((e, k) => { a![2 * k] = e[0]!; a![2 * k + 1] = e[1]! }); edgeArr.set(net, a) } return a }

/** Сеть одного сочетания «вариант + месяц» на canvas. Цвет — сохранённое display-сопоставление, ключ — raw группа.
 *  Наведение подсвечивает группу и показывает МО, клик выбирает МО. При первом показе сеть проявляется. */
export function Network({ cm, net, obs, focus = null, selected = null, onPick, small = false, label, ratio = 1.3 }: {
  cm: ConfigMonth; net: Net; obs: ([string, (number | null)[]] | null)[]; focus?: number | null; selected?: number | null
  onPick?: (ti: number) => void; small?: boolean; label: string
  motionKey?: string; ratio?: number; growOnLoad?: boolean
}) {
  const { pos: lay, aspect } = useMemo(() => layoutFor(net), [net])
  const cv = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState(0)
  const workerFailed = useWorkerFailed()
  // МО под курсором: состояние меняется только при смене МО, подсказка двигается напрямую (ref), не чаще раза за кадр
  const [hoverTi, setHoverTi] = useState<number | null>(null)
  const tip = useRef<HTMLDivElement>(null)
  const mv = useRef({ raf: 0, x: 0, y: 0 })
  useEffect(() => () => cancelAnimationFrame(mv.current.raf), [])
  const scope = `${cm.config_id}:${cm.month}`
  const [hoverScope, setHoverScope] = useState(scope)
  if (hoverScope !== scope) {
    setHoverScope(scope)
    setHoverTi(null)
  }
  useEffect(() => { cancelAnimationFrame(mv.current.raf); mv.current.raf = 0 }, [scope])

  useEffect(() => {
    const el = cv.current!
    const ro = new ResizeObserver(() => setSize(el.clientWidth))
    ro.observe(el)
    return () => { ro.disconnect() }
  }, [workerFailed])

  // раскладка вписывается в холст с сохранением пропорций
  // Точки могут перекрываться: это сохранённая проекция двух координат, без раздвигания узлов.
  const { pos, drawWidth } = useMemo(() => {
    const m = new Map<number, P>()
    if (!size) return { pos: m, drawWidth: 0 }
    const W = size, H = size / ratio, pad = small ? 10 : 16
    const a = Math.max(0.6, Math.min(2.2, aspect || 1))
    const iw = W - 2 * pad, ih = H - 2 * pad
    const w = a > iw / ih ? iw : ih * a, h = a > iw / ih ? iw / a : ih
    const ox = pad + (iw - w) / 2, oy = pad + (ih - h) / 2
    lay.forEach((p, ti) => m.set(ti, { x: ox + p[0] * w, y: oy + p[1] * h }))
    return { pos: m, drawWidth: w }
  }, [lay, aspect, size, ratio, small])

  const active = hoverTi != null ? (typeof cm.lab[hoverTi] === 'number' ? (cm.lab[hoverTi] as number) : null) : focus
  const radius = Math.max(1.1, Math.min(small ? 2.4 : 3, (3.1 * drawWidth) / 880))
  // поток: сеть рисуется там и приходит картинкой; без потока — в основном потоке
  const last = useRef(0)
  useEffect(() => {
    const el = cv.current
    if (!el || !size) return
    if (canvasWorker()) {
      const w = size, h = size / ratio, n = cm.lab.length, cvScale = scaleOf(el)
      const posA = new Float32Array(2 * n).fill(NaN), fills = new Uint8Array(n), group = new Int16Array(n).fill(-1), palette: string[] = [], memo = new Map<string, number>()
      const col = new Map<number, string>(); cm.clusters.forEach(c => col.set(c.g, cssColor(el, rankColor(cm, c.g))))
      pos.forEach((p, i) => { posA[2 * i] = p.x; posA[2 * i + 1] = p.y })
      for (let i = 0; i < n; i++) {
        const l = cm.lab[i]; if (typeof l === 'number') group[i] = l
        const c = typeof l === 'number' ? (active != null && l !== active ? '#C3C8D2' : col.get(l)!) : '#fff'
        let pi = memo.get(c); if (pi == null) { pi = palette.length; palette.push(c); memo.set(c, pi) } fills[i] = pi
      }
      const my = ++last.current
      const request = requestBitmap({ type: 'net', o: { w, h, dpr: dprFor(w, h, undefined, cvScale), pos: posA, edges: edgesOf(net).slice(), fills, palette, group, active: active ?? -1, r: radius, ring: hoverTi ?? selected ?? -1 } },
        bmp => { if (last.current !== my || !cv.current) bmp.close(); else showBitmap(cv.current, bmp) })
      return () => { cancelBitmap(request) }
    }
    const { ctx, w, h, dpr } = fitCanvas(el, size / ratio)
    const col = new Map<number, string>()
    cm.clusters.forEach(c => col.set(c.g, cssColor(el, rankColor(cm, c.g))))
    const paper = '#fff', mute = '#C3C8D2'
    drawNet({
      ctx, dpr, w, h, view: ID_VIEW, pos, edges: net.edges, r: radius,
      color: i => { const l = cm.lab[i]; return typeof l === 'number' ? (active != null && l !== active ? mute : col.get(l)!) : paper },
      hiEdge: active != null ? (s, t) => cm.lab[s] === active && cm.lab[t] === active : undefined,
      ring: hoverTi ?? selected,
    })
  }, [pos, size, ratio, cm, net, active, hoverTi, selected, radius, workerFailed])

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), m = mv.current, z = scaleOf(e.currentTarget)
    m.x = (e.clientX - r.left) / z; m.y = (e.clientY - r.top) / z
    if (m.raf) return
    m.raf = requestAnimationFrame(() => {
      m.raf = 0
      const ti = nearest(pos, m.x, m.y, ID_VIEW, 8)
      setHoverTi(ti)
      if (tip.current && ti != null) tip.current.style.transform = `translate(${Math.round(Math.min(m.x + 12, Math.max(0, size - 250)))}px, ${Math.round(m.y + 12)}px)`
    })
  }
  const hl = hoverTi != null ? cm.lab[hoverTi] : null
  const c = typeof hl === 'number' ? clusterOf(cm, hl) : undefined
  return (
    <div className="relative">
      <canvas key={workerFailed ? 'local' : 'worker'} ref={cv} role="img" aria-label={label} className={`block w-full ${onPick ? 'cursor-pointer' : ''}`}
        style={{ height: size ? size / ratio : undefined, aspectRatio: size ? undefined : `${ratio}` }}
        tabIndex={onPick ? 0 : undefined}
        onKeyDown={e => {
          if (!onPick || !['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key)) return
          e.preventDefault()
          const nodes = [...pos.keys()], at = nodes.indexOf(hoverTi ?? selected ?? -1)
          if (e.key === 'Enter' || e.key === ' ') { const ti = hoverTi ?? selected; if (ti != null) onPick(ti); return }
          const nextIndex = at < 0 ? (e.key === 'ArrowRight' ? 0 : nodes.length - 1) : (at + (e.key === 'ArrowRight' ? 1 : -1) + nodes.length) % nodes.length
          const next = nodes[nextIndex]
          if (next != null) { setHoverTi(next); onPick(next) }
        }}
        onPointerMove={onMove} onPointerLeave={() => { cancelAnimationFrame(mv.current.raf); mv.current.raf = 0; setHoverTi(null) }} onClick={e => {
          const r = e.currentTarget.getBoundingClientRect(), z = scaleOf(e.currentTarget)
          const ti = nearest(pos, (e.clientX - r.left) / z, (e.clientY - r.top) / z, ID_VIEW, 10)
          if (ti != null) onPick?.(ti)
        }} />
      <div ref={tip} hidden={hoverTi == null} className="pointer-events-none absolute top-0 left-0 z-10 grid max-w-[240px] gap-0.5 bg-ink px-3 py-2 text-[12px] text-white shadow-[4px_4px_0_var(--mark)] [&[hidden]]:hidden">
        {hoverTi != null && (<>
          <b className="text-[13px]">{T[hoverTi].name}</b>
          {T[hoverTi].region && <span className="text-[#D5D8E0]">{T[hoverTi].region}</span>}
          <span>{c ? c.name : 'вне групп'} · все категории {rub(obs[hoverTi]?.[1][0])}</span>
        </>)}
      </div>
    </div>
  )
}
