// Отрисовка сети на canvas: тысячи точек и связей без DOM-элементов (SVG с 2 тыс. кругов и 7 тыс. линий заметно тормозил).
// Координаты точек — в «мировых» единицах; вид (сдвиг и масштаб) применяется при рисовании.

import { scaleOf } from './zoom'

export type P = { x: number; y: number }
export interface View { x: number; y: number; k: number }
export const ID_VIEW: View = { x: 0, y: 0, k: 1 }

/** Цвет из CSS-переменной (var(--g1)) → строка, понятная canvas. */
export function cssColor(el: Element, c: string) {
  if (!c.startsWith('var(')) return c
  return getComputedStyle(el).getPropertyValue(c.slice(4, -1)).trim() || '#999'
}

/** Бюджет пикселей холста: при DPR 2 большой холст весит 4–5 млн точек, и каждый его кадр дорого передаётся
 *  композитору. Плотность снижаем ровно настолько, чтобы уложиться в бюджет; маленькие холсты остаются чёткими. */
export const PX_BUDGET = 1.3e6
/** z — масштаб страницы (zoom корня): холст рисуется в экранных пикселях, иначе при увеличении картинка мылится. */
export const dprFor = (w: number, h: number, budget = PX_BUDGET, z = 1) => Math.max(1, Math.min(2.4, (window.devicePixelRatio || 1) * z, Math.sqrt(budget / Math.max(1, w * h))))

/** Холст под размер элемента с учётом плотности пикселей; возвращает контекст и CSS-размер. */
export function fitCanvas(cv: HTMLCanvasElement, h?: number, budget = PX_BUDGET) {
  const w = cv.clientWidth, hh = h ?? cv.clientHeight
  const dpr = dprFor(w, hh, budget, scaleOf(cv))
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr) }
  const ctx = cv.getContext('2d')!
  return { ctx, w, h: hh, dpr }
}

/** Ближайшая точка к экранной позиции (линейный поиск по 2 тыс. — доли миллисекунды). */
export function nearest(pos: Map<number, P>, sx: number, sy: number, view: View, radius: number) {
  const wx = (sx - view.x) / view.k, wy = (sy - view.y) / view.k, r2 = (radius / view.k) ** 2
  let best: number | null = null, bd = r2
  pos.forEach((p, i) => { const d = (p.x - wx) ** 2 + (p.y - wy) ** 2; if (d < bd) { bd = d; best = i } })
  return best
}

export interface DrawOpts {
  ctx: CanvasRenderingContext2D; dpr: number; w: number; h: number; view: View
  pos: Map<number, P>; edges: ReadonlyArray<ReadonlyArray<number | null>>
  color: (i: number) => string; r: number
  edgeColor?: string; edgeWidth?: number
  /** связи, которые нужно выделить (например, внутри группы под курсором) */
  hiEdge?: (s: number, t: number) => boolean; hiEdgeColor?: string
  alpha?: (i: number) => number
  ring?: number | null
  labels?: { i: number; text: string }[]
}

export function drawNet(o: DrawOpts) {
  const { ctx, dpr, w, h, view, pos } = o
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.x, dpr * view.y)
  const lw = (o.edgeWidth ?? 0.6) / view.k
  // все связи одним контуром
  // рёбра — дуги, тонкие и прозрачные; выделяются только рёбра активной группы
  const arc = (a: P, b: P) => { ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2 - (b.y - a.y) * 0.16, (a.y + b.y) / 2 + (b.x - a.x) * 0.16, b.x, b.y) }
  ctx.beginPath()
  for (const e of o.edges) { const a = pos.get(e[0]!), b = pos.get(e[1]!); if (a && b) arc(a, b) }
  ctx.strokeStyle = o.edgeColor ?? (o.hiEdge ? 'rgba(17,17,17,.03)' : 'rgba(17,17,17,.07)'); ctx.lineWidth = lw * 0.85; ctx.stroke()
  if (o.hiEdge) {
    ctx.beginPath()
    for (const e of o.edges) { if (!o.hiEdge(e[0]!, e[1]!)) continue; const a = pos.get(e[0]!), b = pos.get(e[1]!); if (a && b) arc(a, b) }
    ctx.strokeStyle = o.hiEdgeColor ?? 'rgba(17,17,17,.22)'; ctx.lineWidth = lw * 1.2; ctx.stroke()
  }
  // точки: группируем по цвету и прозрачности, чтобы менять стиль заливки реже
  const r = o.r / Math.sqrt(view.k)
  const buckets = new Map<string, number[]>()
  pos.forEach((_, i) => { const k = `${o.color(i)}|${o.alpha ? o.alpha(i) : 1}`; let b = buckets.get(k); if (!b) buckets.set(k, (b = [])); b.push(i) })
  buckets.forEach((ids, key) => {
    const [c, a] = key.split('|')
    ctx.globalAlpha = Number(a); ctx.fillStyle = c; ctx.beginPath()
    for (const i of ids) { const p = pos.get(i)!; ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, Math.PI * 2) }
    ctx.fill()
    ctx.lineWidth = 0.6 / view.k; ctx.strokeStyle = '#fff'; ctx.stroke()
  })
  ctx.globalAlpha = 1
  if (o.ring != null && pos.has(o.ring)) { const p = pos.get(o.ring)!; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.2, 0, Math.PI * 2); ctx.lineWidth = 2 / view.k; ctx.strokeStyle = '#111'; ctx.stroke() }
  if (o.labels?.length) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.font = '600 12px "Golos Text Variable", Arial, sans-serif'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.fillStyle = '#111'
    for (const l of o.labels) { const p = pos.get(l.i); if (!p) continue; const sx = p.x * view.k + view.x + r * view.k + 4, sy = p.y * view.k + view.y; if (sx < 0 || sy < 0 || sx > w || sy > h) continue; ctx.strokeText(l.text, sx, sy); ctx.fillText(l.text, sx, sy) }
  }
}
