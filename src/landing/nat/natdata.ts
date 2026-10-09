// Адаптер: блоки «первый экран / коротко о главном / атлас / история» читают данные сайта (base, lead, leadnet, map)
// в компактном виде. Ничего не пересчитывает в данных, только собирает поля для этих блоков.
import { CATS, LAST_MONTH, LEAD, MONTHS, T, base, catalogOf, groupColor, median } from '../data'
import leadRaw from '../i26/lead.json'
import leadNetRaw from '../i26/leadnet.json'
import mapRaw from '../i26/map.json'
import newTerrRaw from '../i26/newterr.json'
import type { ConfigMonth, Net } from '../data'

export type Lab = number | string | null
export interface Cluster { g: number; name: string; size: number; median: number[]; display_group: number }
const lead = leadRaw as unknown as ConfigMonth[]
const leadNet = leadNetRaw as unknown as Net
// Статический рассказ — NCut10; сравниваются только соседние наблюдённые пары.
const tr = base.transitions[LEAD] ?? []
const histories = T.map((_, ti) => {
  const observed = lead.filter(cm => typeof cm.lab[ti] === 'number').length
  let switches = 0
  for (let mi = 0; mi < tr.length; mi++) {
    const a = lead[mi].lab[ti], b = lead[mi + 1].lab[ti]
    if (typeof a === 'number' && typeof b === 'number' && tr[mi].from_raw_to_raw[String(a)] !== b) switches++
  }
  return { observed, complete: observed === lead.length, switches }
})
const stableN = histories.filter(r => r.complete && r.switches === 0).length
const switchingN = histories.filter(r => r.complete && r.switches > 0).length
const aris = tr.flatMap(t => t.ARI == null ? [] : [t.ARI]).toSorted((a, b) => a - b)
const vis = tr.flatMap(t => t.VI == null ? [] : [t.VI])
export const TRACK = {
  pairs: tr.length, ariMin: aris[0] ?? null, ariMed: median(aris), ariMax: aris.at(-1) ?? null,
  viMed: median(vis), moved: tr.reduce((s, t) => s + t.matched_changed_n, 0), common: tr.reduce((s, t) => s + t.common, 0),
  switching: switchingN, stable: stableN, total: stableN + switchingN,
  incomplete: histories.filter(r => !r.complete).length,
}
export const N = {
  meta: { dataset: String(base.meta.dataset ?? ''), lead: LEAD, lead_name: catalogOf(LEAD).display_name, dict_year: Number(base.meta.dict_year ?? 2024), gv_month: base.graphRules.month },
  categories: CATS,
  months: MONTHS.map(m => m.month),
  terr: T,
  regionsN: new Set(T.map(t => t.region).filter(Boolean)).size,
  lab: lead.map(cm => cm.lab) as Lab[][],
  clusters: lead.map(cm => cm.clusters.map(c => ({ g: c.g, name: c.name, size: c.size, median: c.median as number[], display_group: c.display_group }))),
  obs: MONTHS[MONTHS.length - 1].obs.map(o => (o && o[0] === 'observed' ? o[1][0] : null)),
  edges: leadNet.edges.map(e => [e[0], e[1], e[2]] as [number, number, number]),
  // Сохранённая проекция X0/X1; без старой раскладки I26 и без обрезки выбросов.
  xy: leadNet.xy,
  geo: T.map(t => t.geo),
  stable: stableN, switching: switchingN,
  pairs: base.graphRules.pairs.filter(p => p.ARI != null).map(p => ({ a: p.left, b: p.right, ARI: p.ARI! })),
  observedLast: MONTHS[MONTHS.length - 1].obs.filter(o => o && o[0] === 'observed').length,
  lastMonth: LAST_MONTH,
}
// новые территории России (Крым, Севастополь, ДНР, ЛНР, Запорожская и Херсонская области) в справочнике границ отсутствуют:
// рисуются тем же бледным слоем «нет данных о тратах», что и МО без данных (scripts/add-new-territories.mjs)
export const NEW_TERRITORIES = newTerrRaw as { names: string[]; path: string }
export const MAP = { ...(mapRaw as { W: number; H: number; paths: Record<string, string>; out: string; outN: number }), out: mapRaw.out + NEW_TERRITORIES.path } as { W: number; H: number; paths: Record<string, string>; out: string; outN: number }
export const LAST = N.months.length - 1
export { monthLabel, monthIn, rub, num } from '../data'
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
export const monthShort = (m: string) => `${MONTHS_SHORT[+m.slice(5) - 1]} ${m.slice(2, 4)}`
export const rankOrder = (cl: Cluster[]) => cl.toSorted((a, b) => (b.median[0] ?? -1) - (a.median[0] ?? -1)).map(c => c.g)
export const clusterOf = (cl: Cluster[], g: number) => cl.find(c => c.g === g)
export const rankColor = (cl: Cluster[], g: number) => groupColor(clusterOf(cl, g)?.display_group ?? g)
export const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10, b = n % 100
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many
}
export { SCOPE_NOTE as SCOPE } from '../data'
