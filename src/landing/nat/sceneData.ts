import { LAST, N, clusterOf, rankColor, rankOrder, rub } from './natdata'
import { cssColor } from '../canvasNet'
import { MONTHS } from '../data'
import { H, MAPY, W, type SceneData } from './sceneCore'

// ---------------------------------------------------------------------------------------------------------------
// Данные вступительных сцен: фиксированные NCut10, декабрь 2024. Здесь — только числа и тексты для глав;
// раскладки облака и отрисовка — в sceneCore (в фоновом потоке, если браузер умеет OffscreenCanvas).
// ---------------------------------------------------------------------------------------------------------------
const PADX = 60

export const lab = N.lab[LAST], cl = N.clusters[LAST], order = rankOrder(cl)
export const val = (ti: number) => N.obs[ti]
export const seen = N.terr.map((_, i) => i).filter(i => val(i) != null && typeof lab[i] === 'number')
const sorted = seen.map(i => val(i)!).sort((a, b) => a - b)
export const vmin = sorted[0], vmax = sorted[sorted.length - 1]
const lo = sorted[Math.floor(sorted.length * 0.005)], hi = sorted[Math.ceil(sorted.length * 0.995) - 1]
const X = (v: number) => PADX + Math.max(0, Math.min(1, (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)))) * (W - 2 * PADX)
const ticks = [15000, 20000, 25000, 30000, 40000, 50000, 60000].filter(t => t >= lo && t <= hi)
const rowY = (r: number) => 64 + r * (H - 160) / Math.max(1, order.length - 1)
export const groups = order.map(g => clusterOf(cl, g)!)
export const ratio = (groups[0].median[0] ?? 0) / (groups[groups.length - 1].median[0] || 1)
export const missing = N.terr.length - seen.length
const lastObs = MONTHS[MONTHS.length - 1].obs
export const shareOf = (i: number) => { const o = lastObs[i]; return o && o[1][0] && o[1][3] != null ? (o[1][3] as number) / (o[1][0] as number) : null }

const NT = N.terr.length
export const GEO = new Float32Array(2 * NT).fill(NaN)
export const NET = new Float32Array(2 * NT).fill(NaN)
N.geo.forEach((p, i) => { if (p) { GEO[2 * i] = p[0]; GEO[2 * i + 1] = p[1] + MAPY } })
N.xy.forEach((p, i) => { if (p) { NET[2 * i] = 60 + p[0] * (W - 120); NET[2 * i + 1] = 30 + p[1] * (H - 80) } })
const has = (a: Float32Array, i: number) => !Number.isNaN(a[2 * i])
export const noGeo = seen.filter(i => !has(GEO, i)).length

const kmBetween = (a: [number, number], b: [number, number]) => {
  const Re = 6371, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r
  return 2 * Re * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2))
}
// Доля среди отображённых рёбер с LL обоих концов. SVG-координаты geo не являются широтой/долготой.
// Пример пары выбирается среди сильных связей (верхняя четверть по весу), доступных и на карте, и в проекции.
export const FAR = (() => {
  const km = (a: [number, number], b: [number, number]) => {
    const Re = 6371, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2
    return 2 * Re * Math.asin(Math.sqrt(h))
  }
  const ws = N.edges.map(e => e[2]).sort((a, b) => a - b), wq = ws[Math.floor(ws.length * 0.75)]
  let n = 0, far = 0, best: { s: number; t: number; d: number } | null = null
  for (const [s0, t0, w] of N.edges) {
    const a = N.terr[s0].ll, b = N.terr[t0].ll
    if (!a || !b) continue
    const d = km(a, b); n++; if (d > 1000) far++
    if (w >= wq && has(GEO, s0) && has(GEO, t0) && has(NET, s0) && has(NET, t0) && (!best || d > best.d)) best = { s: s0, t: t0, d }
  }
  return { share: n ? far / n : 0, n, farN: far, totalEdges: N.edges.length, unknownCoordinateEdges: N.edges.length - n, best }
})()
export const fb = FAR.best
export const pairName = (i: number) => `${N.terr[i].short}${N.terr[i].region ? ` (${N.terr[i].region})` : ''}`

/** Пакет данных для отрисовки (собирается один раз, когда первая сцена подходит к экрану). */
export function buildData(el: Element): SceneData {
  const shareRank = (() => { const v = seen.map(i => [i, shareOf(i) ?? 0] as const).sort((a, b) => a[1] - b[1]); return new Map(v.map(([i], k) => [i, k / (v.length - 1)])) })()
  const colors: Record<number, string> = {}
  cl.forEach(c => { colors[c.g] = cssColor(el, rankColor(cl, c.g)) })
  const xv = new Float32Array(NT).fill(NaN), labA = new Int16Array(NT).fill(-1), row = new Int8Array(NT).fill(-1), shareStep = new Uint8Array(NT)
  for (const i of seen) {
    xv[i] = X(val(i)!); labA[i] = lab[i] as number; row[i] = order.indexOf(lab[i] as number)
    shareStep[i] = Math.min(5, Math.floor((shareRank.get(i) ?? 0) * 6))
  }
  const edges = new Int32Array(2 * N.edges.length), far = new Uint8Array(N.edges.length), bundle = new Uint8Array(N.edges.length)
  const reg = fb ? N.terr[fb.s].region : null
  N.edges.forEach((e, k) => {
    edges[2 * k] = e[0]; edges[2 * k + 1] = e[1]
    const a = N.terr[e[0]].ll, b = N.terr[e[1]].ll
    if (a && b && kmBetween(a, b) > 1000) { far[k] = 1; if (reg && (N.terr[e[0]].region === reg || N.terr[e[1]].region === reg)) bundle[k] = 1 }
  })
  return {
    n: NT, seen: Int32Array.from(seen), xv, lab: labA, row, geo: GEO, net: NET, shareStep, edges, far, bundle, colors,
    short: N.terr.map(t => t.short),
    axis: { ticks: ticks.map(t => ({ x: X(t), label: `${Math.round(t / 1000)} тыс.` })), title: 'Модельные средние расходы жителей, ₽; лог. шкала', missing: missing > 0 ? `нет публикации за месяц: ${missing} МО (не ноль) — не показаны` : '' },
    rows: groups.map((g, r) => ({ y: rowY(r), label: `G${g.g} · ${g.size.toLocaleString('ru-RU')} МО`, color: colors[g.g], xm: X(g.median[0]), median: `${rub(g.median[0])}` })),
    rowYs: groups.map((_, r) => rowY(r)),
    pair: fb ? { s: fb.s, t: fb.t } : null,
  }
}
