import { useRef } from 'react'
import { LAST, N, SCOPE, monthIn, monthLabel } from './natdata'
import { MONTHS, catalogOf, useConfig } from '../data'
import { useView } from '../selection'
import { MapAtlas } from './MapAtlas'
import { Bare, Sec, Tabs } from './Head'
import { Groups } from '../Groups'

const completeHistories = N.terr.filter((_, ti) => MONTHS.every(m => m.obs[ti]?.[0] === 'observed')).length
const n = (v: number) => v.toLocaleString('ru-RU')


/** Начало страницы в стиле плаката: первый экран с картой, полоса состава, «коротко о главном», атлас и история. */
export function Opening() {
  const root = useRef<HTMLDivElement>(null)

  const total = N.terr.length
  return (
    <div ref={root}>
      <section className="hero-sec" id="top" aria-labelledby="top-t">
        <div className="hero">
          <figure className="poster-art map-art" aria-hidden>
            <MapAtlas compact />
            <figcaption><b>{n(N.observedLast)}</b> с данными · {monthLabel(N.months[LAST])}</figcaption>
          </figure>
          <div className="hero-copy">
            <p className="kicker">00 · Онлайн-конкурс СберИндекса · «Кластеризация»</p>
            <h1 id="top-t">Какие муниципалитеты тратят похоже?</h1>
            <p className="lede">Сравните безналичные расходы жителей 2 190 территорий России: найдите похожие муниципалитеты, изучите их расходные профили и посмотрите, как меняется состав групп по месяцам.</p>
            <dl className="stats">
              <div className="stat"><dt>муниципалитетов</dt><dd><b>{n(total)}</b></dd></div>
              <div className="stat"><dt>регионов</dt><dd><b>{N.regionsN}</b></dd></div>
              <div className="stat"><dt>месяца, 2023–2024</dt><dd><b>{N.months.length}</b></dd></div>
              <div className="stat"><dt>групп в подробном виде</dt><dd><b>10</b></dd></div>
            </dl>
            <p className="start-guide-h">С чего начать</p>
            <ul className="start-guide">
              <li><a href="#atlas"><b>Карта групп</b><span>какие МО в какой группе, по месяцам</span></a></li>
              <li><a href="#explore"><b>Найти свой муниципалитет</b><span>расходы, группа и похожие МО</span></a></li>
              <li><a href="#methods"><b>Проверить метод</b><span>как сравнивали варианты и качество</span></a></li>
            </ul>
            <p className="scope">{SCOPE}</p>
          </div>
        </div>
        <h2 className="brief-h"><b>Коротко:</b> что мы нашли</h2>
        <ol className="brief-grid">
          <li><a href="#story"><span className="n">10</span><span className="t">Подробные расходные профили</span>
            <span className="d">NCut10, декабрь 2024: число территорий — {n(N.observedLast)}. Группы различаются уровнем и составом наблюдаемых расходов.</span></a></li>
          <li><a href="?v=SSE_K06#groups"><span className="n">6</span><span className="t">Укрупнённый обзор SSE6</span>
            <span className="d">Средний ARI: 0,9469 в июне и 0,9252 в декабре 2024, по десять подвыборок из 80% территорий.</span></a></li>
          <li><a href="#atlas-map"><span className="n">{n(completeHistories)}<small> из {n(N.terr.length)}</small></span><span className="t">Полная история за 24 месяца</span>
            <span className="d">Изменения считаются после сопоставления групп на общих территориях. Пропуск публикации не считается переходом.</span></a></li>
          <li><a href="#methods"><span className="n">6</span><span className="t">Индексов качества</span>
            <span className="d">SW, CH, S_Dbw, AVI, AVU и MQ. Неопределённые значения сохраняем; устойчивость и разделённость оцениваем отдельно.</span></a></li>
        </ol>
        <p className="brief-note">Начните с шести укрупнённых профилей SSE6; для подробного сравнения перейдите к NCut10 и контрольному SSE10. Это самостоятельные разбиения, их группы не складываются.</p>
      </section>
    </div>
  )
}

/** Раздел 02: карта по месяцам и портреты групп (вкладки). */
export function AtlasSection() {
  const { config, mi } = useView()
  const entry = useConfig(config)
  const cm = entry.state === 'ready' ? entry.data[mi] : null
  return (
    <Sec id="atlas" n="02" title="Где какая группа и чем группы отличаются?"
      answer={cm ? <>В {monthIn(MONTHS[mi].month)}: число групп — {cm.clusters.length}, наблюдаемых территорий — {n(cm.native_n)}. {catalogOf(config).display_name}. Портреты показывают характерные расходы, разброс и примеры территорий.</> : <>Загружаем выбранное представление.</>}>
      <Tabs label="Атлас" items={[
        { id: 'atlas-map', label: 'Карта по месяцам', body: <MapAtlas /> },
        { id: 'groups', label: 'Портреты групп', body: <Bare><Groups /></Bare> },
      ]} />
    </Sec>
  )
}
