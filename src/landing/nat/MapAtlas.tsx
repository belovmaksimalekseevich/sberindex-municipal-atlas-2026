import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { MapCanvas } from './MapCanvas'
import { LAST, MAP, NEW_TERRITORIES, N, rankColor as staticColor } from './natdata'
import { MONTHS, T, catalogOf, clusterOf, rankColor, monthLabel, monthShort, rankOrder, retry, rub, useConfig, type ConfigMonth } from '../data'
import { useMo, useView } from '../state'

const fillOf = (cm: ConfigMonth, focus: number | null) => (ti: number) => {
  const raw = cm.lab[ti]
  if (typeof raw !== 'number') return '#D9DCE3'
  if (focus != null && raw !== focus) return '#E9EBF0'
  return rankColor(cm, raw)
}

const MonthStrip = memo(function MonthStrip({ data, mi, onPick }: { data: ConfigMonth[]; mi: number; onPick: (i: number) => void }) {
  const years = [...new Set(MONTHS.map(m => m.month.slice(0, 4)))]
  const drag = useRef(false)
  const at = (e: React.PointerEvent) => { const m = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-m]')?.dataset.m; if (m != null) onPick(+m) }
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = Math.max(0, Math.min(LAST, mi + (e.key === 'ArrowRight' ? 1 : -1))); onPick(n); (e.currentTarget.querySelector(`[data-m="${n}"]`) as HTMLElement)?.focus() }
  }
  return <div className="mstrip" role="radiogroup" aria-label="Месяц" onKeyDown={key}
    onPointerDown={e => { drag.current = true; at(e) }} onPointerMove={e => { if (drag.current) at(e) }}
    onPointerUp={() => { drag.current = false }} onPointerCancel={() => { drag.current = false }} onPointerLeave={() => { drag.current = false }}>
    {years.map(y => <div key={y} className="myear"><span className="myear-h">{y}</span><div className="mcells">
      {MONTHS.map((m, i) => m.month.startsWith(y) && <button key={m.month} type="button" role="radio" aria-checked={i === mi} tabIndex={i === mi ? 0 : -1} data-m={i} title={monthLabel(m.month)} aria-label={monthLabel(m.month)} onClick={() => onPick(i)}>
        <span className="mbar">{rankOrder(data[i]).map(g => <i key={g} style={{ flexGrow: clusterOf(data[i], g)!.size, background: rankColor(data[i], g) }} />)}
          <i className="mbar-none" style={{ flexGrow: T.length - data[i].assigned_n }} /></span>
        <span className="ml">{monthShort(m.month).slice(0, 1).toUpperCase()}</span>
      </button>)}
    </div></div>)}
  </div>
})

/** Компактная иллюстрация начала рассказа фиксирована: NCut10, декабрь. */
export function MapAtlas({ compact = false }: { compact?: boolean }) {
  return compact ? <div className="map-compact"><MapCanvas still fill={ti => {
    const raw = N.lab[LAST][ti]
    return typeof raw === 'number' ? staticColor(N.clusters[LAST], raw) : '#D9DCE3'
  }} label="Карта NCut10, декабрь 2024" /></div> : <SelectedAtlas />
}

function SelectedAtlas() {
  const { config } = useView()
  const entry = useConfig(config)
  if (entry.state === 'error') return <p role="status">Не удалось загрузить модель. <button className="underline" onClick={() => retry(config)}>Повторить</button></p>
  if (entry.state !== 'ready') return <div className="skeleton aspect-[1.6]" role="status" aria-label="Загружаем карту выбранной модели" />
  return <AtlasReady key={config} data={entry.data} />
}

function AtlasReady({ data }: { data: ConfigMonth[] }) {
  const { config, mi, setMi } = useView()
  const { setTi } = useMo()
  const [play, setPlay] = useState(false)
  const [focus, setFocus] = useState<number | null>(null)
  const [tipTi, setTipTi] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null), tipEl = useRef<HTMLDivElement>(null)
  const miRef = useRef(mi); miRef.current = mi
  const pickMonth = useCallback((i: number) => { setPlay(false); setMi(i) }, [setMi])
  const cm = data[mi], order = rankOrder(cm), month = MONTHS[mi].month
  const none = useMemo(() => cm.lab.filter(l => typeof l !== 'number').length, [cm])
  const noGeometry = useMemo(() => cm.lab.filter((l, ti) => typeof l === 'number' && !MAP.paths[T[ti].id]).length, [cm])
  useEffect(() => { setFocus(null); setTipTi(null) }, [mi])
  useEffect(() => {
    if (!play) return
    const t = setInterval(() => { if (!document.hidden) setMi((miRef.current + 1) % MONTHS.length) }, 900)
    const io = new IntersectionObserver(es => { if (!es[es.length - 1].isIntersecting) setPlay(false) })
    if (box.current) io.observe(box.current)
    return () => { clearInterval(t); io.disconnect() }
  }, [play, setMi])
  const terr = tipTi != null ? T[tipTi] : null, raw = tipTi != null ? cm.lab[tipTi] : null
  return <div className="atlas">
    <div className="atlas-bar">
      <div className="atlas-step" role="group" aria-label="Месяцы: шаг назад, проигрывание, шаг вперёд">
        <button type="button" aria-label="Предыдущий месяц" disabled={mi === 0} onClick={() => pickMonth(mi - 1)}><ChevronLeft aria-hidden strokeWidth={2.5} /></button>
        <button type="button" className="atlas-play" onClick={() => setPlay(p => !p)} aria-pressed={play} aria-label={play ? 'Остановить' : 'Проиграть месяцы'}>{play ? <Pause aria-hidden fill="currentColor" strokeWidth={2} /> : <Play aria-hidden fill="currentColor" strokeWidth={2} />}</button>
        <button type="button" aria-label="Следующий месяц" disabled={mi === LAST} onClick={() => pickMonth(mi + 1)}><ChevronRight aria-hidden strokeWidth={2.5} /></button>
      </div>
      <p className="atlas-month" aria-live="polite">{monthLabel(month)} · {cm.method}{cm.K}</p>
      <MonthStrip data={data} mi={mi} onPick={pickMonth} />
      <ul className="atlas-legend" aria-label={`Все ${cm.K} групп выбранной модели`}>
        {order.map(g => { const c = clusterOf(cm, g)!; return <li key={g}><button type="button" aria-pressed={focus === g} onClick={() => setFocus(f => f === g ? null : g)}>
          <i style={{ background: rankColor(cm, g) }} />G{g} <b>{c.size.toLocaleString('ru-RU')}</b><small>{c.name} · медиана {rub(c.median[0])}</small>
        </button></li> })}
        <li className="atlas-none"><i />нет данных за месяц <b>{none}</b></li>
        <li className="atlas-none atlas-out"><i />нет данных о тратах в исследовании <b>{MAP.outN + NEW_TERRITORIES.names.length}</b></li>
      </ul>
    </div>
    <p className="fig-cap !mb-0">{catalogOf(config).display_name}. Цвет — сопоставленная группа, номер G — исходная метка месяца. Наведите на МО; клик выбирает его для паспорта. Поиск МО в паспорте доступен без карты.</p>
    <div ref={box} className="atlas-map">
      <MapCanvas fill={fillOf(cm, focus)} version={`${config}-${mi}-${focus}`} ring={tipTi} tipRef={tipEl} label={`Карта ${cm.method}${cm.K}, ${monthLabel(month)}`} onHover={setTipTi} onPick={setTi} />
      <div ref={tipEl} className="atlas-tip" hidden={!terr}>{terr && tipTi != null && <>
        <b>{terr.name}</b><span>{terr.region ?? 'регион не указан в справочнике'}</span>
        <span>{typeof raw === 'number' ? <><i style={{ background: rankColor(cm, raw) }} />G{raw} · {clusterOf(cm, raw)?.name}</> : 'нет публикации за месяц'}</span>
        <span>Все категории: {rub(MONTHS[mi].obs[tipTi]?.[1][0])}</span>
      </>}</div>
    </div>
    <p className="atlas-notes-p">Цвета сопоставлены по общим ID соседних месяцев с максимумом пересечения. Это не постоянные экономические типы; одинаковый цвет у разных моделей не означает одну группу. {none} ID без публикации за месяц отмечены как нет данных (не ноль). {noGeometry} наблюдаемых ID без геометрии отсутствуют на карте, но сохранены в модели и поиске. За пределами расходной опоры — {MAP.outN} контуров справочника и {NEW_TERRITORIES.names.length} дополнительных территорий. Географический слой и названия справочные, за 2024 год; исторические границы 2023 года не восстанавливались.</p>
  </div>
}
