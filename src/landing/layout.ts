// Координаты для показа приходят вместе с сетью месяца из принятой проекции сохранённых признаков.
// Раскладка условная, это не география и не точная шкала расстояний модели.
import type { Net } from './data'

export interface Layout { pos: Map<number, [number, number]>; aspect: number }
const cache = new WeakMap<Net, Layout>()

/** Текущая X0/X1-проекция сохраняется точно; рамка 0,5–99,5% ниже — только для прежних форматов. */
export function layoutFor(net: Net): Layout {
  const hit = cache.get(net)
  if (hit) return hit
  const pts = net.xy.map((p, ti) => [ti, p] as const).filter((e): e is readonly [number, [number, number]] => e[1] != null)
  if (net.layout === 'minmax_X0_level_X1_h_projection') {
    const out = { pos: new Map(pts.map(([ti, xy]) => [ti, xy] as const)), aspect: net.aspect }
    cache.set(net, out)
    return out
  }
  const q = (a: number[], f: number) => a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * f)))]
  const xs = pts.map(e => e[1][0]).sort((a, b) => a - b), ys = pts.map(e => e[1][1]).sort((a, b) => a - b)
  const robust = pts.length > 300
  const [x0, x1, y0, y1] = robust ? [q(xs, 0.005), q(xs, 0.995), q(ys, 0.005), q(ys, 0.995)] : [xs[0], xs[xs.length - 1], ys[0], ys[ys.length - 1]]
  const cl = (v: number) => Math.min(1, Math.max(0, v))
  const pos = new Map<number, [number, number]>()
  for (const [ti, p] of pts) pos.set(ti, [cl((p[0] - x0) / (x1 - x0 || 1)), cl((p[1] - y0) / (y1 - y0 || 1))])
  // пропорции раскладки в исходных единицах (aspect из сборки относится к полной рамке, пересчитываем для обрезанной)
  const aspect = robust ? (net.aspect || 1) * ((x1 - x0) / (y1 - y0 || 1)) : net.aspect || 1
  const out = { pos, aspect }
  cache.set(net, out)
  return out
}
