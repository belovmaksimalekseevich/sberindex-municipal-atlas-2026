import { base, MONTHS, catalogOf, num, monthLabel, monthsCount, type Metric } from './data'
import { useView } from './state'
import { Sec } from './nat/Head'

const IDS = ['SW', 'CH', 'S_Dbw', 'AVI', 'AVU', 'MQ'] as const
const ABOUT: Record<string, { name: string; read: string }> = {
  SW: { name: 'Silhouette — силуэт', read: 'Средняя близость к своей группе относительно ближайшей другой. Значение от −1 до 1; отрицательное положение отдельного МО указывает на перекрытие профилей.' },
  CH: { name: 'Calinski–Harabasz', read: 'Межгрупповой разброс относительно внутригруппового. Шкала не ограничена; значение зависит в том числе от числа групп.' },
  S_Dbw: { name: 'Scatter + Density between', read: 'Рассеяние внутри групп и плотность между ними. При нулевом знаменателе пары индекс не определён; это не ноль и не численная победа другого метода.' },
  AVI: { name: 'Average Isolability', read: 'Средняя изолированность групп в общей оценочной сети: соотношение внутренних и внешних весов связей.' },
  AVU: { name: 'Average Unifiability', read: 'Средняя объединяемость групп по межгрупповым связям. Меньше — лучше при фиксированном K. Абсолютные значения AVU не используются для ранжирования K6/K10.' },
  MQ: { name: 'Modularity Quality', read: 'Сосредоточение связей внутри групп сверх ожидания модели Ньюмана, γ=1. Оценка выполнена в общей сети, отдельно от графа обучения.' },
}
const finite = (m: Metric | undefined) => m && ['ok', 'computed'].includes(m.status) && m.value != null && Number.isFinite(m.value) ? m.value : null
const statusLabel = (m: Metric | undefined) => !m ? 'Нет сохранённого показателя' : m.status === 'undefined' ? 'Не определён' : ['ok', 'computed'].includes(m.status) ? 'Рассчитан' : m.status === 'unavailable' ? 'Недоступен' : m.status === 'not_computed' ? 'Не рассчитан' : `Статус: ${m.status}`
const reasonLabel = (reason: string | null | undefined) => reason === 'pair_denominator_zero' ? 'Нулевой знаменатель для пары групп.' : reason || null
const fmt = (id: string, value: number) => num(value, id === 'CH' ? 1 : 3)

export function Quality() {
  const { mi, config } = useView()
  return (
    <Sec id="quality" n="13" className="cv" title="Как оценивали качество групп?"
      answer={<>Все шесть индексов показаны со значением, статусом и причиной недоступности. Они оценивают разные свойства; общий балл и автоматический победитель между K=6 и K=10 не строятся.</>}>
      <div>
        <div className="tiles" style={{ ['--cols' as string]: 3 }}>{IDS.map(id => <Spark key={`${config}-${id}`} id={id} mi={mi} config={config} />)}</div>
        <p className="note">«{catalogOf(config).display_name}», {monthLabel(MONTHS[mi].month)}. Каждая миниатюра использует шкалу только доступных значений за {monthsCount(MONTHS.length)}; пропуски разрывают линию. Общая геометрия и оценочная сеть радиуса 1,5 позволяют читать показатели на одинаковой опоре; изменение K всё равно меняет задачу разделения.</p>
      </div>
    </Sec>
  )
}

function Spark({ id, mi, config }: { id: string; mi: number; config: string }) {
  const records = base.metrics.map(rows => rows.find(r => r.id === config)?.metrics.find(x => x.id === id))
  const values = records.map(finite), available = values.filter((v): v is number => v != null)
  const low = available.length ? Math.min(...available) : null, high = available.length ? Math.max(...available) : null
  const width = 240, height = 56, x = (i: number) => values.length > 1 ? i / (values.length - 1) * width : width / 2
  const y = (v: number) => low == null || high == null || high === low ? height / 2 : height - 4 - (v - low) / (high - low) * (height - 8)
  let path = ''
  values.forEach((value, i) => { if (value != null) path += `${i && values[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(value).toFixed(1)}` })
  const current = values[mi], metric = records[mi], def = base.definitions[id], about = ABOUT[id]
  return (
    <figure className="m-0 flex flex-col gap-1.5 icvi-tile">
      <div className="flex items-baseline justify-between gap-3">
        <figcaption><span className="tile-t !m-0 block !normal-case">{id}</span><span className="block text-[13px] text-muted-ink">{about.name} · {def.direction === 'higher' ? 'выше — лучше' : 'ниже — лучше'}</span></figcaption>
        <span className="font-mono text-[15px] tnum">{current == null ? '—' : fmt(id, current)}</span>
      </div>
      <p className="m-0 text-[12.5px] leading-snug">{statusLabel(metric)}{metric?.reason ? `: ${reasonLabel(metric.reason)}` : ''}</p>
      {available.length > 0 && low != null && high != null ? <>
        <svg viewBox={`-4 -4 ${width + 8} ${height + 8}`} preserveAspectRatio="none" className="block h-[44px] w-full" role="img" aria-label={`${id}: число месяцев с доступным значением — ${available.length}, от ${fmt(id, low)} до ${fmt(id, high)}`}>
          <path data-spark pathLength={1} d={path} fill="none" stroke="var(--ink)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          {values.map((v, i) => v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={i === mi ? 4 : 1.5} fill={i === mi ? 'var(--g2)' : 'var(--ink)'} />)}
        </svg>
        <p className="m-0 font-mono text-[11px] text-muted-ink tnum">{available.length}/{MONTHS.length} месяцев: {fmt(id, low)}–{fmt(id, high)}</p>
      </> : <p className="note !m-0">Численных значений нет; шкала не строится.</p>}
      <p className="m-0 text-[12.5px] leading-snug">{about.read}</p>
      <details className="text-[11px] text-muted-ink"><summary>Версия формулы</summary><code className="break-all">{def.formula}</code></details>
    </figure>
  )
}
