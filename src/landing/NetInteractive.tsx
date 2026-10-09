import { useEffect, useMemo, useRef, useState } from 'react'
import { T, rankColor, type ConfigMonth, type Net } from './data'
import { layoutFor } from './layout'
import { ID_VIEW, cssColor, drawNet, fitCanvas, nearest, type P, type View } from './canvasNet'
import { scaleOf } from './zoom'

const K_MIN = 0.5, K_MAX = 12

/** Полноэкранная сеть на canvas: масштаб колесом, щипком или кнопками, сдвиг фона, перетаскивание точек
 *  (связи тянутся следом), подписи МО при приближении. Перемещение точек — только для чтения, данные не меняются. */
export function NetInteractive({ cm, net, focus, selected, onPick, ratio, label }: {
  cm: ConfigMonth; net: Net; obs: ([string, (number | null)[]] | null)[]
  focus: number | null; selected: number | null; onPick: (ti: number) => void; ratio: number; label: string
}) {
  const { pos: lay, aspect } = useMemo(() => layoutFor(net), [net])
  const cv = useRef<HTMLCanvasElement>(null)
  const [w, setW] = useState(0)
  const h = w / ratio
  const base = useMemo(() => {
    const m = new Map<number, P>()
    if (!w) return m
    const pad = 20, iw = w - 2 * pad, ih = h - 2 * pad, a = Math.max(0.6, Math.min(2.2, aspect || 1))
    const ww = a > iw / ih ? iw : ih * a, hh = a > iw / ih ? iw / a : ih
    const ox = pad + (iw - ww) / 2, oy = pad + (ih - hh) / 2
    lay.forEach((p, ti) => m.set(ti, { x: ox + p[0] * ww, y: oy + p[1] * hh }))
    return m
  }, [lay, aspect, w, h])
  const pos = useRef(new Map<number, P>())
  const view = useRef<View>({ ...ID_VIEW })
  const raf = useRef(0)
  const ptrs = useRef(new Map<number, P>())
  const drag = useRef<{ i: number | null; last: P; moved: number } | null>(null)
  const pinch = useRef<number | null>(null)
  const zoomLabel = useRef<HTMLSpanElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const scope = `${cm.config_id}:${cm.month}`
  const [hoverContext, setHoverContext] = useState({ scope, net })
  if (hoverContext.scope !== scope || hoverContext.net !== net) {
    setHoverContext({ scope, net })
    setHover(null)
  }
  useEffect(() => {
    cancelAnimationFrame(raf.current)
    ptrs.current.clear()
    drag.current = null
    pinch.current = null
    pos.current = new Map(base)
    view.current = { ...ID_VIEW }
    if (zoomLabel.current) zoomLabel.current.textContent = '100%'
  }, [base, scope])
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  useEffect(() => { const el = cv.current!; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); return () => ro.disconnect() }, [])

  const redraw = () => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const el = cv.current
      if (!el || !w) return
      const { ctx, dpr } = fitCanvas(el, h)
      const col = new Map<number, string>(); cm.clusters.forEach(c => col.set(c.g, cssColor(el, rankColor(cm, c.g))))
      const active = hover != null && typeof cm.lab[hover] === 'number' ? (cm.lab[hover] as number) : focus
      const k = view.current.k
      const labels = k >= 4 ? [...pos.current.keys()].map(i => ({ i, text: T[i].short ?? T[i].name })) : [selected, hover].filter((i): i is number => i != null).map(i => ({ i, text: T[i].name }))
      drawNet({ ctx, dpr, w, h, view: view.current, pos: pos.current, edges: net.edges, r: 3.4,
        color: i => { const l = cm.lab[i]; return typeof l === 'number' ? (active != null && l !== active ? '#C3C8D2' : col.get(l)!) : '#fff' },
        hiEdge: active != null ? (s, t) => cm.lab[s] === active && cm.lab[t] === active : undefined, ring: selected, labels })
    })
  }
  useEffect(redraw)

  const toLocal = (cx: number, cy: number) => { const r = cv.current!.getBoundingClientRect(), z = scaleOf(cv.current!); return { x: (cx - r.left) / z, y: (cy - r.top) / z } }
  const zoomAt = (sx: number, sy: number, f: number) => {
    const v = view.current, k = Math.min(K_MAX, Math.max(K_MIN, v.k * f))
    view.current = { k, x: sx - (sx - v.x) * (k / v.k), y: sy - (sy - v.y) * (k / v.k) }
    if (zoomLabel.current) zoomLabel.current.textContent = `${Math.round(k * 100)}%`
    redraw()
  }
  // колесо масштабирует с Ctrl/⌘ или после клика по графу, иначе прокручивает окно как обычно
  const armed = useRef(false)
  useEffect(() => {
    const el = cv.current!
    const arm = () => { armed.current = true }
    el.addEventListener('pointerdown', arm)
    const on = (e: WheelEvent) => { if (!(e.ctrlKey || e.metaKey || armed.current)) return; e.preventDefault(); const p = toLocal(e.clientX, e.clientY); zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))) }
    el.addEventListener('wheel', on, { passive: false })
    return () => { el.removeEventListener('wheel', on); el.removeEventListener('pointerdown', arm) }
  })
  const onDown = (e: React.PointerEvent) => {
    cv.current!.setPointerCapture(e.pointerId)
    const p = toLocal(e.clientX, e.clientY); ptrs.current.set(e.pointerId, p)
    if (ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; pinch.current = Math.hypot(a.x - b.x, a.y - b.y); drag.current = null; return }
    drag.current = { i: nearest(pos.current, p.x, p.y, view.current, 12), last: p, moved: 0 }
  }
  const onMove = (e: React.PointerEvent) => {
    const p = toLocal(e.clientX, e.clientY)
    if (!ptrs.current.has(e.pointerId)) { const n = nearest(pos.current, p.x, p.y, view.current, 10); if (n !== hover) setHover(n); return }
    ptrs.current.set(e.pointerId, p)
    if (pinch.current != null && ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()], d = Math.hypot(a.x - b.x, a.y - b.y); zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.current); pinch.current = d; return }
    const g = drag.current; if (!g) return
    const dx = p.x - g.last.x, dy = p.y - g.last.y; g.last = p; g.moved += Math.abs(dx) + Math.abs(dy)
    if (g.i == null) { view.current.x += dx; view.current.y += dy }
    else if (g.moved > 3) {
      const q = pos.current.get(g.i)
      if (!q) { drag.current = null; return }
      pos.current.set(g.i, { x: q.x + dx / view.current.k, y: q.y + dy / view.current.k })
    }
    redraw()
  }
  const onUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId); if (ptrs.current.size < 2) pinch.current = null
    const g = drag.current; if (g?.i != null && g.moved <= 3) onPick(g.i)
    drag.current = null
  }
  const zoomCenter = (f: number) => zoomAt(w / 2, h / 2, f)
  const resetView = () => {
    view.current = { ...ID_VIEW }
    pos.current = new Map(base)
    if (zoomLabel.current) zoomLabel.current.textContent = '100%'
    redraw()
  }
  return (
    <div className="relative">
      <canvas ref={cv} role="img" tabIndex={0} aria-label={`${label}. Стрелки влево и вправо выбирают МО; плюс и минус меняют масштаб.`} className="block w-full cursor-grab touch-none select-none active:cursor-grabbing" style={{ height: h || undefined }}
        onKeyDown={e => {
          if (!['ArrowLeft', 'ArrowRight', '+', '-', 'Home'].includes(e.key)) return
          e.preventDefault()
          if (e.key === '+' || e.key === '-') { zoomCenter(e.key === '+' ? 1.4 : 1 / 1.4); return }
          if (e.key === 'Home') { resetView(); return }
          const nodes = [...pos.current.keys()], at = nodes.indexOf(selected ?? -1)
          const nextIndex = at < 0 ? (e.key === 'ArrowRight' ? 0 : nodes.length - 1) : (at + (e.key === 'ArrowRight' ? 1 : -1) + nodes.length) % nodes.length
          const next = nodes[nextIndex]
          if (next != null) onPick(next)
        }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => setHover(null)} />
      <div className="absolute right-2 bottom-2 flex items-center gap-1 border-2 border-ink bg-white p-1 text-[13px] shadow-[4px_4px_0_var(--mark)]">
        <button type="button" onClick={() => zoomCenter(1 / 1.4)} aria-label="Отдалить" className="h-9 w-9 text-lg hover:bg-[var(--mark)]">−</button>
        <span ref={zoomLabel} className="w-12 text-center font-mono tnum text-muted-ink" aria-live="polite">100%</span>
        <button type="button" onClick={() => zoomCenter(1.4)} aria-label="Приблизить" className="h-9 w-9 text-lg hover:bg-[var(--mark)]">+</button>
        <button type="button" onClick={() => { resetView() }} className="h-9 px-3 hover:bg-[var(--mark)]">Сбросить вид</button>
      </div>
    </div>
  )
}
