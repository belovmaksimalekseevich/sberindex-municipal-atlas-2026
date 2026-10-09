import { useEffect, useRef, useState, type RefObject } from 'react'
import { MAP, N } from './natdata'
import { dprFor } from '../canvasNet'
import { scaleOf } from '../zoom'
import { paintMap } from './sceneCore'
import { canvasWorker, ensureLocalPaths, requestBitmap, showBitmap } from './workerHost'

// Карта МО: 2,6 тыс. контуров растеризуются в фоновом потоке (OffscreenCanvas) и приходят готовой картинкой
// (ImageBitmap → холст «bitmaprenderer», без копирования): основной поток не рисует ни одного контура.
// Без поддержки OffscreenCanvas — тот же код рисования в основном потоке.
// Попадание курсора — isPointInPath с отбором по рамке (Path2D строятся при первом наведении).
// Кольцо выбранного МО — SVG поверх карты: смена МО под курсором не перерисовывает карту.
const IDS = Object.keys(MAP.paths)
const idx = new Map(N.terr.map((t, i) => [t.id, i]))
const TI = IDS.map(id => idx.get(id) ?? -1)
type Shape = { ti: number; p: Path2D; box: [number, number, number, number] }
const boxOf = (d: string): [number, number, number, number] => {
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let k = 0; k + 1 < nums.length; k += 2) { const x = nums[k], y = nums[k + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  return [x0, y0, x1, y1]
}
let SHAPES: Shape[] | null = null
function shapes() {
  if (SHAPES) return SHAPES
  SHAPES = []
  IDS.forEach((id, k) => { const ti = TI[k]; if (ti < 0) return; const d = MAP.paths[id]; SHAPES!.push({ ti, p: new Path2D(d), box: boxOf(d) }) })
  return SHAPES
}
const ringOf = (ti: number) => { const d = MAP.paths[N.terr[ti].id]; return d ? { d, box: boxOf(d) } : null }
// контекст только для проверки попадания (isPointInPath не зависит от размера холста)
let HIT: CanvasRenderingContext2D | null = null
const hitCtx = () => (HIT ??= document.createElement('canvas').getContext('2d')!)

export function MapCanvas({ fill, ring = null, ringFill, onHover, tipRef, onPick, label, version = 0, still = false, budget, className = '' }: {
  /** цвет МО по индексу территории (null — МО без данных) */
  fill: (ti: number) => string
  /** МО с обводкой и жёлтой точкой (SVG поверх карты) */
  ring?: number | null
  /** заливка МО с кольцом (например, чёрным — выбранное МО) */
  ringFill?: string
  /** смена МО под курсором (вызывается только при смене) */
  onHover?: (ti: number | null) => void
  /** подсказка, которую карта сама передвигает за курсором (без перерисовки React) */
  tipRef?: RefObject<HTMLElement | null>
  onPick?: (ti: number) => void
  label: string
  /** меняется — карта перерисовывается (например, номер месяца) */
  version?: number | string
  /** карта не меняется (рисуется один раз, бюджет пикселей больше) */
  still?: boolean
  /** бюджет пикселей холста (меньше — для карт, которые часто перекрашиваются) */
  budget?: number
  className?: string
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const [w, setW] = useState(0)
  // карта рисуется, когда подходит к экрану (не все карты страницы при загрузке)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = wrap.current!
    let lw = 0
    const ro = new ResizeObserver(() => { const nw = el.clientWidth; if (Math.abs(nw - lw) > 2) { lw = nw; setW(nw) } }); ro.observe(el)
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setNear(true); io.disconnect() } }, { rootMargin: '100% 0px' }); io.observe(el)
    return () => { ro.disconnect(); io.disconnect() }
  }, [])
  const fillRef = useRef(fill); fillRef.current = fill
  const last = useRef(0)
  useEffect(() => {
    const el = cv.current
    if (!w || !near || !el) return
    const h = (w * MAP.H) / MAP.W, dpr = dprFor(w, h, budget ?? (still ? 1.3e6 : 1.1e6), scaleOf(el)), sc = w / MAP.W
    const W2 = Math.round(w * dpr), H2 = Math.round(h * dpr)
    // палитра и номер цвета каждого контура (255 — контур вне справочника, не рисуется)
    const css = getComputedStyle(wrap.current!), memo = new Map<string, number>(), palette: string[] = []
    const f = fillRef.current, fills = new Uint8Array(IDS.length)
    TI.forEach((ti, k) => {
      if (ti < 0) { fills[k] = 255; return }
      const c = f(ti)
      let pi = memo.get(c)
      if (pi == null) { pi = palette.length; palette.push(c.startsWith('var(') ? css.getPropertyValue(c.slice(4, -1)).trim() || '#999' : c); memo.set(c, pi) }
      fills[k] = pi
    })
    const worker = canvasWorker()
    if (!worker) {
      ensureLocalPaths()
      paintMap(el, W2, H2, dpr * sc, 0.35 / sc, fills, palette)
      return
    }
    const my = ++last.current
    // пришла устаревшая картинка (месяц уже сменился) — выбрасываем
    requestBitmap({ type: 'map', w: W2, h: H2, scale: dpr * sc, lw: 0.35 / sc, fills, palette }, bmp => { if (last.current !== my || !cv.current) bmp.close(); else showBitmap(cv.current, bmp) }, [fills.buffer])
  }, [w, version, near, still, budget])

  const hit = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect(), sc = r.width / MAP.W, x = (e.clientX - r.left) / sc, y = (e.clientY - r.top) / sc
    const ctx = hitCtx()
    for (const s of shapes()) { const b = s.box; if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue; if (ctx.isPointInPath(s.p, x, y)) return { ti: s.ti, sx: e.clientX - r.left, sy: e.clientY - r.top } }
    return { ti: null, sx: e.clientX - r.left, sy: e.clientY - r.top }
  }
  // наведение: не чаще раза за кадр; React узнаёт только о смене МО, подсказка двигается напрямую
  const mv = useRef<{ raf: number; ev: { clientX: number; clientY: number } | null; last: number | null }>({ raf: 0, ev: null, last: null })
  useEffect(() => () => cancelAnimationFrame(mv.current.raf), [])
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const m = mv.current; m.ev = { clientX: e.clientX, clientY: e.clientY }
    if (m.raf) return
    m.raf = requestAnimationFrame(() => {
      m.raf = 0; const ev = m.ev; if (!ev || !onHover) return
      const h = hit(ev)
      if (h.ti !== m.last) { m.last = h.ti; onHover(h.ti) }
      const tip = tipRef?.current
      if (tip && h.ti != null) { const bw = wrap.current!.clientWidth, z = scaleOf(wrap.current!); tip.style.transform = `translate(${Math.round(Math.min(h.sx / z + 14, bw - tip.offsetWidth - 4))}px, ${Math.round(h.sy / z + 14)}px)` }
    })
  }
  const leave = () => { cancelAnimationFrame(mv.current.raf); mv.current.raf = 0; if (mv.current.last != null) { mv.current.last = null; onHover?.(null) } }
  const rs = ring != null ? ringOf(ring) : null
  return (
    <div ref={wrap} role="img" aria-label={label} className={`map-cv relative ${onPick ? 'cursor-pointer' : ''} ${className}`} style={{ aspectRatio: `${MAP.W} / ${MAP.H}` }}
      onPointerMove={onHover ? onMove : undefined} onPointerLeave={onHover ? leave : undefined}
      onClick={onPick ? e => { const h = hit(e); if (h.ti != null) onPick(h.ti) } : undefined}>
      <canvas ref={cv} aria-hidden className="absolute inset-0 block h-full w-full" />
      {rs && (
        <svg viewBox={`0 0 ${MAP.W} ${MAP.H}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <path d={rs.d} fill={ringFill ?? 'none'} stroke="#111" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          <circle cx={(rs.box[0] + rs.box[2]) / 2} cy={(rs.box[1] + rs.box[3]) / 2} r={w ? (7 * MAP.W) / w : 7} fill="#FFE14D" stroke="#111" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  )
}
