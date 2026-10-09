// Принятый национальный экспорт: NCut10, SSE10 и SSE6. Базовый набор и NCut10 встроены в страницу,
// остальные варианты подгружаются по требованию. Числа МО, месяцев, групп и вариантов в коде не фиксируются.
import { useSyncExternalStore } from 'react'
import baseRaw from './i26/base.json'
import leadRaw from './i26/lead.json'
import leadNetRaw from './i26/leadnet.json'
import { withDisplayNames } from './displayNames'

export type MetricStatus = 'computed' | 'not_computed' | 'undefined' | 'unresolved' | string
export interface Metric { id: string; value: number | null; status: MetricStatus; reason: string | null; formula?: string; direction?: 'higher' | 'lower' }
export interface Example { ti: number; score: number; sw: number; alt: number[] }
export interface Cluster {
  g: number; name: string; size: number; median: (number | null)[]
  /** [n, q25, медиана, q75] по шести показателям */
  profile: [number, number | null, number | null, number | null][] | null
  rc: number[] | null; typical: Example[]; boundary: Example[]; boundary_status: string | null
  conclusion: { status: string; text: string } | null; stability: string | null
  raw_group_id: number; native_cluster_id: string; display_group: number; color_key: string
  mean_SW: number; negative_SW_n: number; negative_SW_fraction: number
  annual_context_coverage: { year: number; covered_n: number; missing_n: number; retrospectively_attached: boolean; independent_validation: boolean }
}
/** [источник, цель, вес, d², уровень, контраст, форма] — индексы МО в territories */
export type Edge = [number, number, number, number, number | null, number | null, number | null]
export interface ConfigMonth {
  month: string; config_id: string; method: string; K: number; native_n: number; assigned_n: number
  /** номер группы МО или статус присвоения (not_observed, isolated, ...) */
  lab: (number | string | null)[]
  raw_lab: (number | null)[]; display_group: (number | null)[]; raw_to_display: Record<string, number>
  graph_asset: string; display_mapping_anchor: string; display_mapping_is_identity: boolean
  sw: (number | null)[]
  clusters: Cluster[]
  gv: { role: string; shown: number; total: number }
  icvi: Metric[]
}
/** Экранная сеть варианта за месяц (top-5 связей у каждого МО) и её раскладка, посчитанная при сборке; грузится отдельно. */
export interface Net { edges: Edge[]; xy: ([number, number] | null)[]; aspect: number; layout?: string; display_rule?: string; role_by_model?: Record<string, string> }
export interface MetricRow {
  id: string; family: string; role: string; in_selector: boolean; K: number; sizes: Record<string, number>
  unresolved: boolean; reasons: string[]; metrics: Metric[]; negative_fraction: number | null
}
export interface CatalogItem { config_id: string; display_name: string; representation: string; fit_method: string; K: number; role: string; in_selector: boolean; fit_graph: string | null; display_graph_asset: string; evaluation_graph: string }
export interface Transition {
  from: string; to: string; common: number; ARI: number | null; VI: number | null; VI_unit: string; status: string
  overlaps: [number, number, number][]; from_raw_to_raw: Record<string, number>; matching_objective: string
  optimal_overlap: number; matched_same_n: number; matched_changed_n: number
  entered_IDs: string[]; exited_IDs: string[]; entered_n: number; exited_n: number
  globally_ambiguous: boolean; optimal_targets_by_source: Record<string, number[]>; group_identity_claim: boolean
}
export interface Base {
  meta: Record<string, unknown> & { lead: string; scope: string; sample_rule: string | null; graph_definition: string; dataset?: string; national_result?: boolean; actual_municipalities?: boolean; scientific_acceptance?: boolean; dict_year?: number; dict_matched?: number }
  selection: { lead: string | null; outcome: string; models: { id: string; eligible: boolean; unresolved: boolean; mean_SW: number; reasons: string[] }[] }
  catalog: CatalogItem[]
  categories: { id: number; label: string; role: 'total' | 'category' }[]
  territories: { id: string; name: string; short: string; region: string | null; type: string | null; oktmo: string | null; geo: [number, number] | null; ll?: [number, number] | null; name2023?: string }[]
  definitions: Record<string, { formula: string; direction: 'higher' | 'lower' }>
  months: { month: string; native_n: number; obs: ([string, (number | null)[]] | null)[] }[]
  metrics: MetricRow[][]
  transitions: Record<string, Transition[]>
  graph_months: { month: string; native_n: number; shown: number; W_fit_edges: number; W_eval_edges: number; asset: string; fit_rule: string; evaluation_rule: string; matrix_sha256: Record<string, string> }[]
  graphRules: {
    month: string; coordinate: string
    variants: { id: string; rule: { support: string; r: number | null; k: number | null; sigma: number }; status: string; partition_status: string; reason: string[]; download: string; download_bytes?: number
      diag: { native_n: number; isolates: number[]; components: number; full_edges: number; degree_q: number[]; min_w: number } }[]
    pairs: { left: string; right: string; common: number; left_n: number; right_n: number; ARI: number | null; VI: number | null; status: string; reason: string | null; overlaps: [number, number, number][] }[]
  }
}

export const base = baseRaw as unknown as Base
export const LEAD = base.selection.lead ?? base.meta.lead
export const T = base.territories
export const MONTHS = base.months
export const CATS = base.categories.map(c => c.id === 3 ? { ...c, label: 'Питание вне дома' } : c)
export const catalogOf = (id: string) => base.catalog.find(c => c.config_id === id)!

/** Обязательная подпись охвата на каждом экране. */
// Статус относится к принятому национальному описательному расчёту, а не к конкурсной подаче или публикации.
export const monthsCount = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'месяц' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'месяца' : 'месяцев'}`
export const SCOPE_NOTE = `Данные СберИндекса: ${T.length.toLocaleString('ru-RU')} территорий за ${monthsCount(MONTHS.length)}. Для каждого месяца показаны доступные наблюдения; отсутствие публикации не означает нулевые расходы.`

// ---- загрузка вариантов: кэш + подписка, без повторных запросов
type Entry = { state: 'ready'; data: ConfigMonth[] } | { state: 'loading' } | { state: 'error'; message: string }
// адрес готового файла сборки через переменную: иначе Vite при сборке переписывает new URL(…, import.meta.url) как ресурс
const HERE: string = import.meta.url
// в собранном сайте файл лежит в assets/, данные рядом в i26/; в dev-сервере Vite данные из public отдаются от корня
const dataUrl = (rel: string) => (import.meta.env.DEV ? new URL(`/i26/${rel}`, location.origin) : new URL(`../i26/${rel}`, HERE)).href
const cache = new Map<string, Entry>([[LEAD, { state: 'ready', data: leadRaw as unknown as ConfigMonth[] }]])
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

// Готовые файлы применяем по одному за задачу: если два варианта пришли вместе, их отрисовка не попадает в один длинный кадр.
let applyChain = Promise.resolve()
function settle(apply: () => void): Promise<void> {
  const operation = applyChain.then(() => new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      try {
        apply()
        requestAnimationFrame(() => resolve())
      } catch (error) {
        reject(error)
      }
    }, 0)
  }))
  // Один повреждённый ответ не блокирует последующие файлы; вызывающий получает ошибку.
  applyChain = operation.catch(() => {})
  return operation
}

function load(id: string) {
  if (cache.has(id)) return
  cache.set(id, { state: 'loading' })
  // путь от файла сборки: и на хостинге, и в просмотре файлы лежат в i26/ рядом с assets/
  fetch(dataUrl(`config/${id}.json`))
    .then(r => { if (!r.ok) throw new Error(`файл варианта не загрузился (${r.status})`); return r.json() })
    .then(data => settle(() => { cache.set(id, { state: 'ready', data: withDisplayNames(data) }); emit() }))
    .catch(e => { cache.set(id, { state: 'error', message: e instanceof Error ? e.message : String(e) }); emit() })
  emit()
}
export function retry(id: string) { cache.delete(id); load(id) }
/** Подгрузить файл варианта заранее (при наведении на выбор варианта), чтобы смена была мгновенной. */
export const prefetch = load
// один и тот же объект, пока данных нет: useSyncExternalStore сравнивает снимки по ссылке, новый объект зациклил бы рендер
const LOADING: Entry = { state: 'loading' }
export function useConfig(id: string, enabled = true): Entry {
  return useSyncExternalStore(
    cb => { listeners.add(cb); if (enabled) load(id); return () => listeners.delete(cb) },
    () => cache.get(id) ?? LOADING,
    () => cache.get(id) ?? LOADING,
  )
}
// Скачиваемые экранные графы лежат рядом с остальными ресурсами текущей сборки.
export const fileUrl = (rel: string) => dataUrl(rel)

// ---- сети вариантов по месяцам: тот же приём кэша и подписки; сеть выбранного варианта за последний месяц встроена
type NetEntry = { state: 'ready'; data: Net } | { state: 'loading' } | { state: 'error'; message: string }
export const LAST_MONTH = MONTHS[MONTHS.length - 1].month
const netKey = (id: string, month: string) => `${catalogOf(id)?.display_graph_asset ?? id}/${month}`
const netCache = new Map<string, NetEntry>([[netKey(LEAD, LAST_MONTH), { state: 'ready', data: leadNetRaw as unknown as Net }]])
function loadNet(key: string) {
  if (netCache.has(key)) return
  netCache.set(key, { state: 'loading' })
  fetch(dataUrl(`net/${key}.json`))
    .then(r => { if (!r.ok) throw new Error(`сеть не загрузилась (${r.status})`); return r.json() })
    .then(data => settle(() => { netCache.set(key, { state: 'ready', data }); emit() }))
    .catch(e => { netCache.set(key, { state: 'error', message: e instanceof Error ? e.message : String(e) }); emit() })
  emit()
}
const NET_LOADING: NetEntry = { state: 'loading' }
export function useNet(id: string, month: string, enabled = true): NetEntry {
  const key = netKey(id, month)
  return useSyncExternalStore(
    cb => { listeners.add(cb); if (enabled) loadNet(key); return () => listeners.delete(cb) },
    () => netCache.get(key) ?? NET_LOADING,
    () => netCache.get(key) ?? NET_LOADING,
  )
}
/** Подгрузить сеть заранее (в простое), чтобы разбор JSON не пришёлся на прокрутку. */
export const prefetchNet = (id: string, month: string) => loadNet(netKey(id, month))
export const retryNet = (id: string, month: string) => { const key = netKey(id, month); netCache.delete(key); loadNet(key) }

// ---- общие помощники
const MONTHS_RU = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре']
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
export const monthLabel = (ym: string) => `${MONTHS_RU[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`
export const monthIn = (ym: string) => `${MONTHS_IN[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`
export const monthShort = (ym: string) => MONTHS_SHORT[Number(ym.slice(5)) - 1]
const rubFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
export const rub = (v: number | null | undefined) => (v == null ? 'нет данных' : `${rubFmt.format(Math.round(v))} ₽`)
export const num = (v: number, digits = 1) => v.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits })
/** строчная только первая буква: «Смешанный профиль — SSE» → «смешанный профиль — SSE», аббревиатуры не трогаем */
export const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
export const GROUP_COLORS = ['#3066C8', '#D26036', '#278568', '#8656AC', '#BD4663', '#2F8DA6', '#9C7624', '#64743F', '#A34D91', '#62788B'] as const
export const groupColor = (displayGroup: number) => GROUP_COLORS[displayGroup] ?? '#939BA8'
/** Цвет — отдельное сохранённое сопоставление, raw g остаётся ключом карточки. */
export const rankColor = (cm: ConfigMonth, g: number) => groupColor(cm.raw_to_display[String(g)] ?? g)
export const displayGroupOf = (cm: ConfigMonth, g: number) => cm.raw_to_display[String(g)] ?? g
export const median = (values: number[]): number | null => {
  if (!values.length) return null
  const s = values.toSorted((a, b) => a - b), m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
export const GRAPH_PROJECTION_NOTE = 'Исходное положение — проекция двух сохранённых координат: уровня расходов и контраста выбранных категорий с Total. Это не география и не полная многомерная близость; масштаб осей свой в каждом месяце.'

/** Группы месяца по убыванию медианы «Все категории»: 0 = верхняя. Номера групп между месяцами и вариантами не сравниваем. */
export function rankOrder(cm: ConfigMonth): number[] {
  return cm.clusters.toSorted((a, b) => (b.median[0] ?? -1) - (a.median[0] ?? -1)).map(c => c.g)
}
export const clusterOf = (cm: ConfigMonth, g: number) => cm.clusters.find(c => c.g === g)
/** По каждому индексу: сколько месяцев каждый вариант из отбора был лучшим; если лучшее значение у нескольких, это ничья. */
export function indexWinners(id: string) {
  const dir = base.definitions[id].direction
  const wins: Record<string, number> = {}
  let ties = 0, months = 0
  for (const ms of base.metrics) {
    const cand = ms.filter(r => r.in_selector).flatMap(r => { const v = r.metrics.find(x => x.id === id)?.value; return v == null ? [] : [{ id: r.id, v }] })
    if (!cand.length) continue
    months++
    const best = dir === 'higher' ? Math.max(...cand.map(c => c.v)) : Math.min(...cand.map(c => c.v))
    const top = cand.filter(c => Math.abs(c.v - best) < 1e-12)
    if (top.length > 1) ties++
    else wins[top[0].id] = (wins[top[0].id] ?? 0) + 1
  }
  const ranked = Object.entries(wins).toSorted((a, b) => b[1] - a[1])
  return { id, months, ties, leader: ranked[0] ?? null }
}

/** Ленивая загрузка: раздел запрашивает данные, только когда подходит к экрану. */
export function useNearViewport<T extends Element>(ref: { current: T | null }, margin = '600px') {
  return useSyncExternalStore(
    cb => {
      const el = ref.current
      if (!el || nearSeen.has(el)) return () => {}
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { nearSeen.add(el); io.disconnect(); cb() } }, { rootMargin: margin })
      io.observe(el)
      return () => io.disconnect()
    },
    () => !!ref.current && nearSeen.has(ref.current),
    () => false,
  )
}
const nearSeen = new WeakSet<Element>()

export const ASSIGN_TEXT: Record<string, string> = {
  not_observed: 'нет публикации за месяц',
  isolated: 'изолировано: правило связей не дало подходящих соседей',
  not_computed: 'не рассчитано',
  unresolved: 'присвоение не определено',
}
