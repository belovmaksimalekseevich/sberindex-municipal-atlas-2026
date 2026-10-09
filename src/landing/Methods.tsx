import { base, MONTHS, catalogOf, monthLabel, num, type Metric } from './data'
import { useView } from './state'
import evidenceRaw from './i26/supporting_evidence.json'
import { Sec } from './nat/Head'

interface StabilityRow {
  method: string; K: number; month: string; draws: number
  mean_ARI: number; minimum_draw_ARI: number; mean_macro_Jaccard: number; minimum_draw_macro_Jaccard: number
}
interface Evidence {
  similarity_comparison: { rows: Record<string, string>[]; row_count: number }
  subsample_stability: { K10: StabilityRow[]; SSE6: { month: string; usable: number; all10_statistics: Omit<StabilityRow, 'method' | 'K' | 'month' | 'draws'> }[] }
}
const evidence = evidenceRaw as unknown as Evidence
const IDS = ['SW', 'CH', 'S_Dbw', 'AVI', 'AVU', 'MQ'] as const
const roles: Record<string, string> = { NCut_K10: 'Подробный сетевой вид', SSE_K10: 'Сравнение при том же K', SSE_K06: 'Отдельный укрупнённый вид' }
const traits: Record<string, { plus: string; minus: string; when: string }> = {
  NCut_K10: { plus: 'Десять подробных расходных профилей связаны с разбиением сети экономической близости.', minus: 'Геометрия части групп неоднородна; административный состав влияет на результат. Универсальная переносимость не установлена.', when: 'Рассматривать подробные расходные различия, состав групп и положение территории в сети.' },
  SSE_K10: { plus: 'Геометрический контроль при тех же десяти группах и той же опоре.', minus: 'По прежним подвыборкам часть групп менее воспроизводима. Другой метод не устраняет ограничения исходных расходных данных.', when: 'Проверять, насколько вывод зависит от метода разбиения при сохранении числа групп.' },
  SSE_K06: { plus: 'Выше средняя устойчивость к подвыборкам в июне и декабре 2024; обзор крупных расходных различий.', minus: 'Укрупнение сглаживает различия. AVU зависит от K и не используется для ранжирования K6/K10. Исходная G7 остаётся геометрически неоднородной. Административная чувствительность SSE6 не проверялась.', when: 'Начинать с крупного обзора и затем смотреть, какие подробные различия он скрывает. Это не родитель десяти групп.' },
}
const value = (metric: Metric | undefined) => metric && ['ok', 'computed'].includes(metric.status) && metric.value != null && Number.isFinite(metric.value) ? metric.value : null
const metricText = (id: string, metric: Metric | undefined) => {
  const v = value(metric)
  return v != null ? num(v, id === 'CH' ? 0 : 3) : metric?.status === 'undefined' ? 'не определён' : metric?.status === 'unavailable' ? 'недоступен' : 'нет значения'
}
const savedNumber = (text: string | undefined) => text?.trim() && Number.isFinite(Number(text)) ? num(Number(text), 3) : '—'

export function Methods({ part = 'all' }: { part?: 'all' | 'table' | 'traits' } = {}) {
  const { mi, config } = useView()
  const rows = base.metrics[mi]
  const stability: StabilityRow[] = [
    ...evidence.subsample_stability.K10,
    ...evidence.subsample_stability.SSE6.map(row => ({ method: 'SSE', K: 6, month: row.month, draws: row.usable, ...row.all10_statistics })),
  ]
  return (
    <Sec id="methods" n="12" className="cv" title="Зачем сохранены три представления?"
      answer={<>NCut10 даёт подробный сетевой вид, SSE10 проверяет его при том же числе групп, SSE6 показывает укрупнённые профили. Это три принятых представления на двух методах; рост одного индекса при уменьшении K не определяет общего победителя.</>}>
      {part !== 'traits' && <div>
        <p className="note !m-0">Показатели за {monthLabel(MONTHS[mi].month)} на одной наблюдаемой опоре. Для неопределённого индекса сохранены статус и причина. Сравнивайте значения вместе с числом групп и содержательной ценой объединения.</p>
        <div className="ptable-wrap">
          <table className="ptable min-w-[900px]">
            <caption className="sr-only">Три принятых представления и шесть индексов за выбранный месяц</caption>
            <thead><tr><th scope="col">Представление</th><th scope="col">K / роль</th>{IDS.map(id => <th key={id} scope="col" className="num">{id} {base.definitions[id].direction === 'higher' ? '↑' : '↓'}</th>)}<th scope="col" className="num">Назначено МО</th></tr></thead>
            <tbody>{base.catalog.map(c => {
              const row = rows.find(r => r.id === c.config_id)
              return <tr key={c.config_id} className={c.config_id === config ? 'sel' : ''}>
                <th scope="row">{c.display_name}</th><td>K={row?.K ?? c.K}<span className="tsub">{roles[c.config_id]}</span></td>
                {IDS.map(id => { const metric = row?.metrics.find(m => m.id === id); return <td key={id} className="num" title={metric?.reason ?? undefined}>{metricText(id, metric)}{metric?.reason && <span className="tsub">{metric.reason === 'pair_denominator_zero' ? 'нулевой знаменатель пары' : metric.reason}</span>}</td> })}
                <td className="num">{row ? Object.values(row.sizes).reduce((a, b) => a + b, 0).toLocaleString('ru-RU') : '—'} / {MONTHS[mi].native_n.toLocaleString('ru-RU')}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
        <p className="tbl-hint">Таблица листается вбок →</p>
        <p className="note">Выделена выбранная пользователем модель. Индексы разных шкал не складываются в балл; неопределённое значение не заменяется нулём. AVU зависит от K и не ранжирует K6/K10.</p>
        <div className="ptable-wrap">
          <table className="ptable min-w-[700px]">
            <caption>Устойчивость: десять 80%-ных подвыборок на месяц</caption>
            <thead><tr><th scope="col">Метод / K</th><th scope="col">Месяц</th><th scope="col" className="num">Подвыборки</th><th scope="col" className="num">ARI средний / минимум</th><th scope="col" className="num">Macro-J средний / минимум</th></tr></thead>
            <tbody>{stability.map(r => <tr key={`${r.method}-${r.K}-${r.month}`}><th scope="row">{r.method}{r.K}</th><td>{monthLabel(r.month)}</td><td className="num">{r.draws}/10</td><td className="num">{num(r.mean_ARI, 3)} / {num(r.minimum_draw_ARI, 3)}</td><td className="num">{num(r.mean_macro_Jaccard, 3)} / {num(r.minimum_draw_macro_Jaccard, 3)}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="note">Каждое разбиение сопоставлено со своей полной опорой; нормировка переоценена на ID подвыборки за 24 месяца. Для K10 повторно использованы принятые результаты RC68. Это парное сравнение июня и декабря, а не новые независимые данные и не проверка устойчивости всех 24 месяцев.</p>
        <details>
          <summary className="tile-t">Предыдущие исследования: {evidence.similarity_comparison.row_count} строк сравнения</summary>
          <p className="note">Это неоднородные строки выполненных исследований, а не 27 самостоятельных методов. Здесь различаются периоды, опоры, K, пространства признаков и оценочные геометрии. Старое шестимесячное исследование устойчивости сохранено отдельно; его нельзя подменять новым двухмесячным результатом SSE6.</p>
          <div className="ptable-wrap"><table className="ptable min-w-[900px]">
            <caption className="sr-only">Исторические исследования с точной областью сравнения</caption>
            <thead><tr><th scope="col">Метод / представление</th><th scope="col">K</th><th scope="col">Период и опора</th><th scope="col">Доступные разбиения</th><th scope="col">SW / конечных</th><th scope="col">Оценочная геометрия и ограничения</th></tr></thead>
            <tbody>{evidence.similarity_comparison.rows.map((r, i) => <tr key={`${i}-${r.config_id}`}>
              <th scope="row">{r.method}<span className="tsub">{r.representation}<br />{r.study || r.config_id}</span></th><td>{r.K || '—'}</td><td>{r.period}<span className="tsub">{r.support}</span></td><td>{r.full_partitions_available || '—'} / {r.full_registered || '—'}</td><td className="num">{savedNumber(r.SW_mean)}<span className="tsub">{r.SW_finite || '—'} конечных</span></td><td>Оценка: {r.evaluator || '—'}<span className="tsub">Сходство для обучения: {r.fitting_similarity || '—'}</span><span className="tsub">Связи для обучения: {r.fitting_edges || '—'}</span><span className="tsub">Ось сравнения: {r.comparison_axis || '—'}</span><span className="tsub">{r.limits || r.decision}</span>{r.stability_protocol && <span className="tsub">{r.stability_protocol}</span>}{(r.ARI_mean || r.macroJ_mean) && <span className="tsub">Средний ARI {savedNumber(r.ARI_mean)} · средний macro-J {savedNumber(r.macroJ_mean)}</span>}</td>
            </tr>)}</tbody>
          </table></div>
          <p className="note">Пустое поле означает отсутствие значения в источнике. Средние только по конечным значениям, особенно S_Dbw, не создают общего рейтинга разных исследований. В прежней шестимесячной проверке худший месячный средний macro-J составлял 0,5613 у NCut10 и 0,6456 у SSE10; этот результат сохраняется наряду с новой двухмесячной проверкой.</p>
        </details>
      </div>}
      {part !== 'table' && <div className="ptable-wrap">
        <table className="ptable traits min-w-[900px]">
          <caption className="sr-only">Сильные стороны, ограничения и применение трёх представлений</caption>
          <thead><tr><th scope="col">Представление</th><th scope="col">Сильная сторона</th><th scope="col">Ограничение</th><th scope="col">Практический вопрос</th></tr></thead>
          <tbody>{base.catalog.map(c => { const t = traits[c.config_id]; return <tr key={c.config_id} className={c.config_id === config ? 'sel' : ''}><th scope="row">{catalogOf(c.config_id).display_name}<span className="tsub">K={c.K}</span></th><td>{t?.plus}</td><td>{t?.minus}</td><td>{t?.when}</td></tr> })}</tbody>
        </table>
      </div>}
    </Sec>
  )
}
