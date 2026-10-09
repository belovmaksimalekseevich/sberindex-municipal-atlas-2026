import { ChevronLeft, ChevronRight } from 'lucide-react'
import { CATS, MONTHS, T, catalogOf, monthLabel, num, rankColor, rankOrder, rub, type ConfigMonth } from './data'
import cardsRaw from './i26/cards_SSE6_December.json'
import { displaySpendingText } from './displayNames'
import { useView } from './selection'
import { WithConfig } from './Toolbar'
import { Sec } from './nat/Head'

interface CoarseCard {
  native_cluster_id: string; raw_group_id: number; month: string
  short_name_ru: string; short_summary: string; coverage_note: string; short_limit: string
}
const coarseCards = (cardsRaw as unknown as { cards: CoarseCard[] }).cards
const median = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b), n = sorted.length
  return n ? (n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : null
}
const ALLM = new Map<number, (number | null)[]>()
const allMed = (mi: number) => {
  let values = ALLM.get(mi)
  if (!values) {
    values = CATS.map((_, k) => median(MONTHS[mi].obs.flatMap(o => o?.[0] === 'observed' && o[1][k] != null ? [o[1][k] as number] : [])))
    ALLM.set(mi, values)
  }
  return values
}
const dev = (value: number | null | undefined, all: number | null) => value == null || !all ? null : (value / all - 1) * 100
const n0 = (value: number) => value.toLocaleString('ru-RU')
const short = (ti: number) => T[ti]?.short ?? `МО ${ti}`

function Card({ cm, g, mi, maxDeviation, config }: { cm: ConfigMonth; g: number; mi: number; maxDeviation: number; config: string }) {
  const c = cm.clusters.find(x => x.g === g)!, all = allMed(mi), color = rankColor(cm, g)
  const card = config === 'SSE_K06' && cm.month === '2024-12' ? coarseCards.find(x => x.raw_group_id === g && x.month === cm.month) : undefined
  const title = cm.month === '2024-12' ? c.name : `Расходный профиль ${g + 1}`
  const summary = card?.short_summary ?? c.conclusion?.text
  const q = c.profile?.[0], coverage = c.annual_context_coverage
  return (
    <article className="grp" style={{ borderTopColor: color }}>
      <header>
        <h3 className="tile-t">{displaySpendingText(title)}<small className="grp-nm">Профиль {g + 1} · G{g} · {monthLabel(cm.month)}</small></h3>
        <p className="m-0 text-[15px]"><b className="font-mono tnum">{n0(c.size)}</b> МО · медиана общих расходов {rub(c.median[0])}{q && q[1] != null && q[3] != null ? <> · центральные 50% — {rub(q[1])}–{rub(q[3])}</> : null}</p>
        {summary && <p className="m-0 text-[14px] leading-snug">{displaySpendingText(summary)}</p>}
      </header>
      <div className="devbars grp-bars">
        {CATS.map((cat, k) => {
          const d = dev(c.median[k], all[k]); if (d == null) return null
          const width = Math.min(Math.abs(d), maxDeviation) / maxDeviation * 50
          return <div key={cat.id} className="db-row">
            <span className="db-l">{cat.label}</span>
            <div className="db-track"><i className="db-zero" />
              <span className="db-bar" style={{ left: d >= 0 ? '50%' : `${50 - width}%`, width: `${width}%`, background: color, top: '20%', height: '60%' }}>
                <b className={d >= 0 ? 'r' : 'l'}>{d >= 0 ? '+' : '−'}{Math.abs(Math.round(d))}%</b>
              </span>
            </div>
          </div>
        })}
      </div>
      <dl className="grp-ex">
        <div><dt>Примеры высокого SW</dt><dd>{c.typical.length ? c.typical.slice(0, 2).map(x => `${short(x.ti)} (SW ${num(x.sw, 2)})`).join(', ') : 'не переданы'}</dd></div>
        <div><dt>Примеры малого SW</dt><dd>{c.boundary.length ? c.boundary.slice(0, 2).map(x => `${short(x.ti)} (SW ${num(x.sw, 2)})`).join(', ') : 'не переданы'}</dd></div>
        {(card?.coverage_note || coverage) && <div><dt>Контекст 2024</dt><dd>{card?.coverage_note ?? `${coverage!.covered_n} из ${c.size} МО; показатели относятся только к территориям с доступным годовым контекстом.`}</dd></div>}
      </dl>
      {card?.short_limit && <p className="note !m-0">{displaySpendingText(card.short_limit)}</p>}
    </article>
  )
}

function GroupCards({ months }: { months: ConfigMonth[] }) {
  const { mi, config } = useView(), cm = months[mi]
  if (!cm) return <p className="note" role="status">Нет сохранённого результата для выбранного месяца.</p>
  const all = allMed(mi)
  const maxDeviation = Math.min(320, Math.max(100, ...cm.clusters.flatMap(c => CATS.map((_, k) => Math.abs(dev(c.median[k], all[k]) ?? 0)))))
  return <div className="grp-grid">{rankOrder(cm).map(g => <Card key={`${config}-${cm.month}-${g}`} cm={cm} g={g} mi={mi} maxDeviation={maxDeviation} config={config} />)}</div>
}

export function Groups() {
  const { mi, setMi, config } = useView()
  return (
    <Sec id="groups" n="10" className="cv" title="Чем различаются расходные профили?"
      answer={<>Показаны все группы выбранного метода и месяца: подробные NCut10, сравнение SSE10 или самостоятельный укрупнённый SSE6. Медианы описывают состав расходов; единую функцию экономики территории они не устанавливают.</>}>
      <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Месяц портретов">
        <button type="button" className="step-btn" aria-label="Предыдущий месяц" disabled={mi === 0} onClick={() => setMi(Math.max(0, mi - 1))}><ChevronLeft className="size-4" aria-hidden /></button>
        <span className="grp-month" aria-live="polite">{monthLabel(MONTHS[mi].month)}</span>
        <button type="button" className="step-btn" aria-label="Следующий месяц" disabled={mi === MONTHS.length - 1} onClick={() => setMi(Math.min(MONTHS.length - 1, mi + 1))}><ChevronRight className="size-4" aria-hidden /></button>
        <span className="text-[14px] text-muted-ink">{catalogOf(config).display_name}. Карточки упорядочены по медиане общих расходов.</span>
      </div>
      <p className="fig-cap !m-0">Полосы — отклонения медиан от всех наблюдаемых МО месяца. Названия и смысловые карточки закреплены за декабрём 2024; номера других месяцев не означают ту же группу. SW — геометрическое положение, не вероятность ошибки.</p>
      {config === 'SSE_K06' && MONTHS[mi].month === '2024-12' && <p className="note !m-0">Названия описывают медианы групп. «Средний расходный уровень» означает близость к медианам всей декабрьской выборки, а не арифметическое среднее. «Самые низкие» — среди шести групп SSE6.</p>}
      <WithConfig>{months => <GroupCards months={months} />}</WithConfig>
      <p className="note !m-0">«Все категории» — отдельная оценка общих расходов, а не сумма пяти отображаемых категорий. SSE6 и NCut10 не являются вложенными уровнями одной иерархии.</p>
    </Sec>
  )
}
