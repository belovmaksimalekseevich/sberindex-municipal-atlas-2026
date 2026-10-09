import { useId, useMemo, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { N, monthLabel, monthShort, num, rub } from './natdata'
import { MONTHS, groupColor, median, retry, retryNet, useConfig, useNet, type ConfigMonth } from '../data'
import { useMo, useView } from '../selection'
import { SectionControls } from '../SiteHeader'
import { stability } from '../stability'
import { MapCanvas } from './MapCanvas'
import { Sec, Tabs } from './Head'
import { FAR } from './sceneData'
import annualRaw from '../i26/annual.json'
import supportRaw from '../i26/supporting_evidence.json'

const CATS = N.categories
const vals = (i: number, mi: number) => { const o = MONTHS[mi].obs[i]; return o && o[0] === 'observed' ? o[1] : null }
const groupOf = (cm: ConfigMonth, i: number) => cm.clusters.find(g => g.g === cm.lab[i])
const colorOf = (cm: ConfigMonth, i: number) => cm.display_group[i] == null ? '#D9DCE3' : groupColor(cm.display_group[i]!)
const groupWord = (cm: ConfigMonth, i: number) => { const g = groupOf(cm, i); if (!g) return 'нет присвоенной группы в этом месяце'; const prefix = `${cm.method}${cm.K} · G${g.g}`; return g.name === prefix ? prefix : `${prefix}: ${g.name}` }
const km = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r
  return 12742 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2))
}
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е')
const INDEX = N.terr.map((t, i) => ({ i, k: norm(`${t.id} ${t.short} ${t.name} ${t.region ?? ''}`) }))
const byShort = (s: string) => N.terr.findIndex(t => t.short === s)
const QUICK = [...new Set([FAR.best?.s, byShort('Яльчикский'), byShort('Норильск'), byShort('Хамовники'), byShort('Сочи')].filter((x): x is number => x != null && x >= 0))]
const n0 = (v: number) => v.toLocaleString('ru-RU')
const sign = (p: number) => `${p >= 0 ? '+' : '−'}${Math.abs(Math.round(p))}%`
function monthStats(mi: number) {
  const observed = N.terr.map((_, i) => i).filter(i => vals(i, mi) != null)
  const sorted = CATS.map((_, k) => observed.flatMap(i => { const v = vals(i, mi)![k]; return v == null ? [] : [v] }).sort((a, b) => a - b))
  const medians = sorted.map(s => median(s))
  const shares = CATS.map((_, k) => median(observed.flatMap(i => { const v = vals(i, mi)!; return v[0] && v[k] != null ? [v[k]! / v[0]] : [] })))
  return { observed, sorted, medians, shares }
}
type Stats = ReturnType<typeof monthStats>
const pctl = (s: number[], v: number) => Math.round(100 * s.filter(x => x < v).length / (s.length || 1))
type StabilityStats = { mean_ARI: number; minimum_draw_ARI: number; mean_macro_Jaccard: number; minimum_draw_macro_Jaccard: number }
const support = supportRaw as unknown as { subsample_stability: { SSE6: { month: string; all10_statistics: StabilityStats }[]; K10: ({ month: string; method: string } & StabilityStats)[] } }
const annual = annualRaw as unknown as { native_n: number; regions_n: number; reference_year: number; observations: (Record<string, number> | null)[]; lab: (number | null)[] }
function robustness(cm: ConfigMonth): StabilityStats | undefined {
  return cm.K === 6 ? support.subsample_stability.SSE6.find(x => x.month === cm.month)?.all10_statistics : support.subsample_stability.K10.find(x => x.month === cm.month && x.method === cm.method)
}
function Search({ onPick, cm }: { onPick: (i: number) => void; cm: ConfigMonth }) {
  const uid = useId()
  const [q, setQ] = useState(''), [hl, setHl] = useState(0), [open, setOpen] = useState(false)
  const res = useMemo(() => {
    const n = norm(q.trim()); if (n.length < 2) return []
    const out: number[] = []
    for (const x of INDEX) { if (x.k.includes(n)) { out.push(x.i); if (out.length >= 8) break } }
    return out
  }, [q])
  const pick = (i: number) => { onPick(i); setQ(''); setOpen(false) }
  return (
    <div className="pp-search">
      <input name="mo" value={q} placeholder="Например: Казань, Иркутск, Ямал…" aria-label="Найти муниципалитет по названию, городу или региону" role="combobox" aria-autocomplete="list"
        autoComplete="off" spellCheck={false} enterKeyHint="search"
        aria-expanded={open && res.length > 0} aria-controls={open && res.length > 0 ? `${uid}-list` : undefined} aria-activedescendant={open && res[hl] != null ? `${uid}-opt-${hl}` : undefined}
        onChange={e => { setQ(e.target.value); setHl(0); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHl(h => Math.min(res.length - 1, h + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHl(h => Math.max(0, h - 1)) }
          else if (e.key === 'Enter' && res[hl] != null) pick(res[hl])
          else if (e.key === 'Escape') setOpen(false)
        }} />
      {open && res.length > 0 && (
        <ul id={`${uid}-list`} role="listbox" className="pp-list">
          {res.map((i, k) => (
            <li key={i} id={`${uid}-opt-${k}`} role="option" aria-selected={k === hl} onMouseDown={e => { e.preventDefault(); pick(i) }} onMouseEnter={() => setHl(k)}>
              <i style={{ background: colorOf(cm, i) }} />
              <b>{N.terr[i].short}</b><span>{N.terr[i].region ?? ''}{N.terr[i].type ? ` · ${N.terr[i].type}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
      {open && q.trim().length >= 2 && !res.length && <p className="pp-empty" role="status">Не нашли. Проверьте название — в справочнике полные официальные названия.</p>}
    </div>
  )
}


function Profile({ a, b, mi, cm, stats }: { a: number; b: number | null; mi: number; cm: ConfigMonth; stats: Stats }) {
  const va = vals(a, mi), vb = b != null ? vals(b, mi) : null
  if (!va) return <p className="text-muted-ink">Нет публикации за {monthLabel(cm.month)}: пропуск не равен нулю.</p>
  const ga = groupOf(cm, a)?.median
  const rel = (v: number | null | undefined, k: number) => v == null || !stats.medians[k] ? null : (v / stats.medians[k]! - 1) * 100
  const MAXP = Math.min(200, Math.max(100, ...CATS.flatMap((_, k) => [rel(va[k], k), rel(vb?.[k], k)].map(x => Math.abs(x ?? 0)))))
  const X = (p: number) => 50 + Math.max(-MAXP, Math.min(MAXP, p)) / MAXP * 50
  return <div className="pp-prof">
    <p className="pp-note pp-enc">Полоса — отклонение от медианы {n0(stats.observed.length)} МО с публикацией в выбранном месяце, риска — медиана своей группы {cm.method}{cm.K}. Шкала ограничена ±{num(MAXP, 0)}%; справа точные значения.{b != null && ' Серая полоса — второе МО.'}</p>
    {b != null && !vb && <p className="pp-note">У второго МО нет публикации за этот месяц.</p>}
    {CATS.map((c, k) => { const pa = rel(va[k], k), pb = rel(vb?.[k], k), pg = rel(ga?.[k], k); return <div key={c.id} className="pp-row">
      <span className="pp-cat">{c.label}</span><div className="pp-track"><i className="pp-zero" />
        {pg != null && <i className="pp-gm" style={{ left: `${X(pg)}%` }} title="медиана своей группы" />}
        {pa != null && <span className="pp-bar a" style={{ left: `${Math.min(50, X(pa))}%`, width: `${Math.abs(X(pa) - 50)}%` }} />}
        {pb != null && <span className="pp-bar b" style={{ left: `${Math.min(50, X(pb))}%`, width: `${Math.abs(X(pb) - 50)}%` }} />}
      </div><span className="pp-val"><b>{rub(va[k])}</b>{pa != null && <small>{sign(pa)}</small>}{vb && <em>{rub(vb[k])}</em>}</span>
    </div> })}
  </div>
}
function Timeline({ i, months }: { i: number; months: ConfigMonth[] }) {
  const ys = MONTHS.map((_, mi) => vals(i, mi)?.[0] ?? null), ok = ys.filter((v): v is number => v != null)
  if (!ok.length) return <p>Публикаций нет.</p>
  const lo = Math.min(...ok) * .95, hi = Math.max(...ok) * 1.05, W = 560, H = 120
  const X = (k: number) => 10 + k / (ys.length - 1) * (W - 20), Y = (v: number) => H - 18 - (v - lo) / (hi - lo || 1) * (H - 36)
  let d = ''; ys.forEach((v, k) => { if (v != null) d += `${d && ys[k - 1] != null ? 'L' : 'M'}${X(k).toFixed(1)} ${Y(v).toFixed(1)}` })
  return <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Опубликованные расходы по месяцам; пропуски разрывают линию">
    <path d={d} fill="none" stroke="#111" strokeWidth={2} />
    {ys.map((v, k) => v != null && <circle key={k} cx={X(k)} cy={Y(v)} r={4.5} fill={colorOf(months[k], i)} stroke="#fff" strokeWidth={1.2}><title>{`${monthLabel(months[k].month)}: ${rub(v)}; ${groupWord(months[k], i)}`}</title></circle>)}
    <text x={10} y={H - 2} className="pp-ax">{monthLabel(months[0].month)}</text><text x={W - 10} y={H - 2} textAnchor="end" className="pp-ax">{monthLabel(months.at(-1)!.month)}</text><text x={10} y={12} className="pp-ax">{rub(Math.max(...ok))} макс.</text>
  </svg>
}
const REGION = new Map<string, number[]>()
N.terr.forEach((t, i) => { if (t.region) REGION.set(t.region, [...(REGION.get(t.region) ?? []), i]) })
function Context({ ti, mi, cm, months, stats }: { ti: number; mi: number; cm: ConfigMonth; months: ConfigMonth[]; stats: Stats }) {
  const t = N.terr[ti], v0 = vals(ti, mi)?.[0] ?? null, mem = t.region ? REGION.get(t.region) ?? [] : []
  const split = new Map<number, number>(); let missing = 0
  mem.forEach(i => { const g = cm.display_group[i]; if (g == null) missing++; else split.set(g, (split.get(g) ?? 0) + 1) })
  const rv = mem.flatMap(i => { const v = vals(i, mi)?.[0]; return v == null ? [] : [v] }), regMed = median(rv)
  const rank = v0 == null ? null : rv.filter(x => x > v0).length + 1
  const ys = MONTHS.map((_, k) => vals(ti, k)?.[0] ?? null), f = ys.findIndex(v => v != null), l = ys.findLastIndex(v => v != null), observed = ys.filter(v => v != null).length
  const g = groupOf(cm, ti), ctx = annual.observations[ti]
  return <aside className="pp-ctx" aria-label={`Контекст: ${t.short}`}>
    <div className="pp-ctx-row"><div className="pp-ctx-top"><h4>Место в регионе</h4><b className="v">{rank != null && rv.length ? `${rank} из ${n0(rv.length)}` : '—'}</b></div>
      <p>{t.region ?? 'Регион не указан'} · {monthLabel(cm.month)}. Медиана опубликованных расходов региона — {rub(regMed)}. Состав по текущему справочнику.</p>
      {mem.length > 0 && <><div className="pp-split" role="img" aria-label={`Группы ${cm.method}${cm.K} в регионе; ${missing} без группы`}>{[...split].sort((a, b) => a[0] - b[0]).map(([id, count]) => <i key={id} style={{ flexGrow: count, background: groupColor(id) }} title={`Цвет ${id + 1}: ${count} МО`} />)}{missing > 0 && <i style={{ flexGrow: missing, background: '#D9DCE3' }} title={`Нет группы: ${missing}`} />}</div><p>Представлено групп: {split.size} · МО без группы: {missing}. Цвет — сохранённое сопоставление, не ранг расходов.</p></>}
    </div>
    <div className="pp-ctx-row"><div className="pp-ctx-top"><h4>Место в выборке</h4><b className="v">{v0 == null ? '—' : `${n0(stats.sorted[0].filter(x => x > v0).length + 1)} из ${n0(stats.sorted[0].length)}`}</b></div><p>Среди МО с публикацией за {monthLabel(cm.month)}. Медиана — {rub(stats.medians[0])}.</p></div>
    <div className="pp-ctx-row"><div className="pp-ctx-top"><h4>Группа месяца</h4><b className="v">{g ? `${n0(g.size)} МО` : '—'}</b></div><p>{groupWord(cm, ti)}. {g && <>Медиана «Все категории» — {rub(g.median[0])}.</>}</p></div>
    <div className="pp-ctx-row"><div className="pp-ctx-top"><h4>История публикаций</h4><b className="v">{observed}/{MONTHS.length}</b></div><p>{f >= 0 && l > f ? `${rub(ys[f])} → ${rub(ys[l])} (${sign((ys[l]! / ys[f]! - 1) * 100)}), ${monthLabel(months[f].month)} — ${monthLabel(months[l].month)}. Значения в рублях приведены как в источнике, без поправки на инфляцию.` : 'Недостаточно публикаций для изменения.'}</p>
      <div className="pp-strip" role="img" aria-label="Сопоставленные группы по месяцам; серый — нет группы">{months.map(m => <i key={m.month} style={{ background: colorOf(m, ti) }} title={`${monthLabel(m.month)}: ${groupWord(m, ti)}`} />)}</div><p>Цвета сопоставлены по общим МО соседних месяцев. Это не доказательство постоянного экономического типа.</p>
    </div>
    <div className="pp-ctx-row"><div className="pp-ctx-top"><h4>Годовой контекст · 2024</h4><b className="v">{ctx ? 'есть' : 'нет'}</b></div>
      {ctx ? <p>Население на 1 января — {n0(ctx.population_jan1_2024)}; доступность рынков — {num(ctx.market_access_2024, 1)}; средняя зарплата работников организаций — {rub(ctx.organization_salary_RUB_2024)}. Зарплата не равна доходам всех жителей.</p> : <p>Для этого ID годового контекста нет; пропуск не заменён нулём.</p>}
      <p>Охват: {n0(annual.native_n)} из {n0(N.terr.length)} ID, {annual.regions_n} регионов. Годовая группировка (KMeans, 6 групп) отделена от ежемесячной SSE6{annual.lab[ti] != null ? `; исходная годовая группа G${annual.lab[ti]}` : ''}. Контекст использован в её расчёте, не является независимой проверкой.{cm.month.startsWith('2023') && ' К 2023 году сведения 2024 года присоединены ретроспективно.'}</p>
    </div>
  </aside>
}
export function Passport() {
  const { config } = useView(), entry = useConfig(config)
  if (entry.state !== 'ready') return <Sec id="explore" n="03" className="passport" title="Найдите свой муниципалитет" answer="Профиль выбранных месяца и модели"><SectionControls variant month />{entry.state === 'loading' ? <p role="status">Загружаем выбранную модель…</p> : <p role="alert">{entry.message} <button type="button" className="pbtn" onClick={() => retry(config)}>Повторить</button></p>}</Sec>
  return <PassportBody months={entry.data} />
}
function PassportBody({ months }: { months: ConfigMonth[] }) {
  const { ti, setTi } = useMo(), { mi, config } = useView(), cm = months[mi], t = N.terr[ti]
  const [cmp, setCmp] = useState<number | null>(null), stats = useMemo(() => monthStats(mi), [mi])
  const temporal = useMemo(() => stability(config, months), [config, months]).rows[ti]
  const net = useNet(config, cm.month), v = vals(ti, mi), g = groupOf(cm, ti), psw = cm.sw[ti], robust = robustness(cm)
  const nb = useMemo(() => net.state === 'ready' ? net.data.edges.filter(e => e[0] === ti || e[1] === ti).map(e => { const i = e[0] === ti ? e[1] : e[0]; return { i, w: e[2], d: t.ll && N.terr[i].ll ? km(t.ll, N.terr[i].ll!) : null } }).sort((a, b) => b.w - a.w) : [], [net, ti, t])
  const role = g?.typical.some(x => x.ti === ti) ? 'один из примеров с высоким SW' : g?.boundary.some(x => x.ti === ti) ? 'один из примеров с низким SW' : null
  const open = (i: number) => { setTi(i); setCmp(null) }, compare = (i: number) => { setCmp(i); dispatchEvent(new CustomEvent('tab:open', { detail: 'pp-cmp' })) }
  const cmpD = cmp != null && t.ll && N.terr[cmp].ll ? km(t.ll, N.terr[cmp].ll!) : null
  const profileProps = { mi, cm, stats }, model = `${cm.method}${cm.K}`
  return <Sec id="explore" n="03" className="passport" title="Найдите свой муниципалитет" answer={<>Любая из {n0(N.terr.length)} территорий: расходы, группа, контекст, динамика и похожие муниципалитеты. Данные относятся к выбранным месяцу и модели.</>}>
    <SectionControls variant month note="История охватывает 24 месяца выбранной модели; годовой контекст отдельно за 2024 год." />
    <div className="pp-one"><div className="pp-left"><Search onPick={open} cm={cm} /><div className="pp-quick pbtns">{QUICK.map(i => <button key={i} type="button" className="pbtn pbtn-sm" onClick={() => open(i)} aria-pressed={i === ti}>{N.terr[i].short}</button>)}<button type="button" className="pbtn pbtn-sm" onClick={() => { if (stats.observed.length) open(stats.observed[Math.floor(Math.random() * stats.observed.length)]) }}>Случайное ↻</button></div>
      <div className="pp-id"><h3>{t.short}</h3><p className="pp-sub">{t.name}{t.region ? ` · ${t.region}` : ' · регион не указан'} · ID {t.id}{t.oktmo ? ` · ОКТМО ${t.oktmo}` : ''}</p><p className="pp-sum">{v?.[0] != null ? `${rub(v[0])} — модельная оценка средних расходов жителей за ${monthLabel(cm.month)}: больше, чем у ${pctl(stats.sorted[0], v[0])}% МО с публикацией. Это оценка безналичных расходов, не доходов населения.` : `Нет публикации за ${monthLabel(cm.month)}: пропуск не равен нулю.`}</p><div className="pp-badges"><span style={{ background: `color-mix(in srgb, ${colorOf(cm, ti)} 20%, white)`, color: '#111' }}>{groupWord(cm, ti)}</span>{role && <span>{role}</span>}</div></div>
    </div><div className="pp-mid"><div className="pp-right"><Tabs label={`Паспорт: ${t.short}`} items={[
      { id: 'pp-prof', label: 'Профиль', body: <Profile a={ti} b={null} {...profileProps} /> },
      { id: 'pp-dyn', label: 'Динамика', body: <><p className="pp-note pp-enc">«Все категории», ₽, модельная оценка средних расходов жителей. Цвета {model} сопоставлены по максимальному пересечению групп соседних месяцев; серый — нет группы. Пропуски разрывают линию.</p><Timeline i={ti} months={months} /><p className="pp-note">Публикаций — {temporal.observed} из {months.length}; число сопоставленных соседних пар — {temporal.comparedPairs}, число смен — {temporal.switches}. {temporal.complete ? 'История полная.' : 'История неполная: отсутствие наблюдаемой смены не означает устойчивость все 24 месяца.'}</p></> },
      { id: 'pp-nb', label: 'Соседи', body: <div className="pp-nbwrap"><div><p className="pp-note pp-enc">Экономическая близость, не потоки денег: объединение пяти сильнейших связей каждого МО с равными весами на границе; у вершины может быть больше пяти связей. Для SSE показана общая сеть сравнения. Справа — расстояние между известными центрами.</p>
        {net.state === 'loading' ? <p role="status">Загружаем сеть месяца…</p> : net.state === 'error' ? <p role="alert">{net.message} <button type="button" className="pbtn" onClick={() => retryNet(config, cm.month)}>Повторить</button></p> : nb.length ? <ol className="pp-nb" tabIndex={0} aria-label="Соседи по сети">{nb.map(x => <li key={x.i}><button type="button" onClick={() => open(x.i)}><i style={{ background: colorOf(cm, x.i) }} /><b>{N.terr[x.i].short}</b><span>{N.terr[x.i].region ?? 'регион неизвестен'}</span><em>{x.d != null ? `${n0(Math.round(x.d))} км` : 'нет координат'}</em></button><button type="button" className="pp-vs pbtn pbtn-sm" onClick={() => compare(x.i)} aria-label={`Сравнить: ${N.terr[x.i].short}`}><ArrowLeftRight aria-hidden strokeWidth={2.25} /></button></li>)}</ol> : <p>Нет показанных связей за {monthLabel(cm.month)}{!v && ': нет публикации'}.</p>}</div><div className="pp-map"><MapCanvas key={`${config}:${mi}`} label={`Где находится ${t.short}`} still ring={ti} ringFill="#111" fill={i => colorOf(cm, i)} />{!t.geo && <p className="pp-note">Геометрия этого МО отсутствует; фиктивная точка не показана.</p>}</div></div> },
      { id: 'pp-cmp', label: 'Сравнение', body: <><div className="pp-cmp">{cmp == null ? <><span className="pp-note !m-0">Выберите второе МО.</span><Search onPick={setCmp} cm={cm} /></> : <><b>«{t.short}» и «{N.terr[cmp].short}»</b><span>{cmpD != null ? `${n0(Math.round(cmpD))} км · ` : 'расстояние неизвестно · '}{net.state !== 'ready' ? 'сеть ещё не загружена' : nb.some(x => x.i === cmp) ? 'есть показанная связь' : 'нет связи в экранном подмножестве'}</span><button type="button" className="pbtn pbtn-sm" onClick={() => setCmp(null)}>Другое МО</button></>}</div>{cmp != null && <Profile a={ti} b={cmp} {...profileProps} />}</> },
      { id: 'pp-st', label: 'Устойчивость', body: <dl className="pp-stab"><div><dt>Модель на подвыборках (80% МО)</dt><dd>{robust ? <>{model}, {monthLabel(cm.month)}, 10 проверок: средний ARI <b>{num(robust.mean_ARI, 3)}</b>, минимум {num(robust.minimum_draw_ARI, 3)}; средний macro-Jaccard {num(robust.mean_macro_Jaccard, 3)}, минимум {num(robust.minimum_draw_macro_Jaccard, 3)}. Это устойчивость всего разбиения, не вероятность и не частота возврата этого МО.</> : 'Для этого месяца соответствующей панели нет. Подтверждённые панели доступны за июнь и декабрь 2024; их результат не переносится автоматически на другие месяцы.'}</dd></div><div><dt>SW положения МО</dt><dd>{psw != null ? <><b>{num(psw, 3)}</b>. От −1 до 1; отрицательное значение означает, что среднее расстояние до ближайшей другой группы меньше, чем до своей. Это геометрия выбранного пространства, не вероятность ошибки.</> : 'Нет присвоения в этом месяце.'}</dd></div><div><dt>Изменения во времени</dt><dd>Число смен — {temporal.switches}; соседних пар с наблюдениями — {temporal.comparedPairs}. Публикации: {temporal.observed}/{months.length} месяцев; {temporal.complete ? 'полная история' : 'неполная история'}.</dd></div><div><dt>Пример группы</dt><dd>{role ?? 'Не входит в выбранные примеры с высоким или низким SW.'} Геометрический пример не устанавливает функциональный тип территории.</dd></div></dl> },
    ]} /></div><div className="pp-kpi"><div><span>Все категории</span><b>{rub(v?.[0])}</b><small>{monthLabel(cm.month)} · {model}</small></div>{[3, 5].map(k => <div key={k}><span>{CATS[k].label} / Total</span><b>{v?.[0] && v[k] != null ? `${num(v[k]! / v[0] * 100, 1)}%` : '—'}</b><small>медиана долей по МО — {stats.shares[k] == null ? 'нет данных' : `${num(stats.shares[k]! * 100, 1)}%`}</small></div>)}<div><span>SW положения</span><b>{psw == null ? '—' : num(psw, 3)}</b><small>геометрия {model}, {monthShort(cm.month)}</small></div></div></div><div className="pp-side"><Context ti={ti} mi={mi} cm={cm} months={months} stats={stats} /></div></div>
  </Sec>
}
