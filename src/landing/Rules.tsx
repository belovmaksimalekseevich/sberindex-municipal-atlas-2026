import { useRef } from 'react'
import { GRAPH_PROJECTION_NOTE, LEAD, MONTHS, base, catalogOf, clusterOf, fileUrl, monthLabel, prefetchNet, rankColor, rankOrder, retry, retryNet, useConfig, useNearViewport, useNet } from './data'
import { useMo, useView } from './state'
import { Network } from './Network'
import { NetExpand } from './NetExpand'
import { Sec, Tabs } from './nat/Head'

/** Раздельные роли сохранённых графов. Старое сравнение правил I26 здесь не воспроизводится. */
export function Rules() {
  const { config, mi } = useView(), { ti, setTi } = useMo()
  const ref = useRef<HTMLDivElement>(null), near = useNearViewport(ref)
  const entry = useConfig(config, near), ne = useNet(config, MONTHS[mi].month, near)
  const gm = base.graph_months[mi], month = MONTHS[mi].month
  const cm = entry.state === 'ready' ? entry.data[mi] : null
  const model = catalogOf(config), n = (x: number) => x.toLocaleString('ru-RU')
  const caption = `${n(gm.shown)} из ${n(gm.W_fit_edges)} связей union15: пять сильнейших у каждого МО, включая равные веса. ${GRAPH_PROJECTION_NOTE}`
  return <Sec id="rules" n="04" className="cv" title="Как связаны модель и сеть?"
    answer="Сеть обучения, сеть оценки и изображение имеют разные роли. Показанные рёбра выражают сходство расходов, а не денежные потоки между территориями.">
    <div ref={ref}><p className="note !m-0">{model.display_name} · {monthLabel(month)} · {n(gm.native_n)} наблюдаемых МО. Геометрия и связи читаются из принятого расчёта; выбор модели меняет группы, а не общую сеть отображения.</p></div>
    <Tabs label="Роли сети" items={[
      { id: 'rules-nets', label: 'Выбранная модель на сети', body: <div>
        {entry.state === 'error' ? <p role="status">Не удалось загрузить группы. <button className="underline" onClick={() => retry(config)}>Повторить</button></p>
          : ne.state === 'error' ? <p role="status">Не удалось загрузить сеть. <button className="underline" onClick={() => retryNet(config, month)}>Повторить</button></p>
          : cm && ne.state === 'ready' ? <>
            <Network cm={cm} net={ne.data} obs={MONTHS[mi].obs} selected={ti} onPick={setTi} label={`${model.display_name}, ${monthLabel(month)}; проекция двух координат`} />
            <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12px]" aria-label={`Все ${cm.K} групп`}>
              {rankOrder(cm).map(g => <li key={g} className="flex items-center gap-1.5" title={clusterOf(cm, g)!.name}><i className="h-2.5 w-2.5 rounded-full" style={{ background: rankColor(cm, g) }} />G{g}: {n(clusterOf(cm, g)!.size)} МО</li>)}
            </ul>
            <div className="mt-3 flex flex-wrap justify-end gap-3"><a className="pbtn pbtn-sm" href={fileUrl(cm.graph_asset)} download>Показанные связи JSON ↓</a>
              <NetExpand title={`${model.display_name} · ${monthLabel(month)}`} caption={caption} net={{ cm, net: ne.data, obs: MONTHS[mi].obs, selected: ti, onPick: setTi, label: 'Сеть выбранной модели на весь экран' }} />
            </div>
          </> : <div className="skeleton aspect-[1.3]" role="status" aria-label="Загружаем сеть выбранного месяца" />}
        <p className="note">{caption} Цвета — сопоставление групп; названия декабря не переносятся на другие месяцы.</p>
      </div> },
      { id: 'rules-diag', label: 'Обучение · оценка · изображение', body: <div className="tiles" style={{ ['--cols' as string]: 3 }}>
        <article className="rules-diag flex flex-col gap-2"><h3 className="tile-t !m-0">Граф обучения NCut</h3><p>Объединение списков 15 ближайших соседей с сохранением равных расстояний; вес exp(−d²/2), σ = 1.</p><dl className="rd-kv"><div><dt>Полных связей</dt><dd>{n(gm.W_fit_edges)}</dd></div><div><dt>Роль выбранного метода</dt><dd>{model.fit_method === 'NCut' ? 'Собственный граф обучения' : 'SSE обучается по координатам X, без графа обучения'}</dd></div></dl></article>
        <article className="rules-diag flex flex-col gap-2"><h3 className="tile-t !m-0">Общий граф оценки</h3><p>Радиус 1,5 в принятой геометрии, σ = 1. Один и тот же граф используется при расчёте графовых индексов трёх разбиений.</p><dl className="rd-kv"><div><dt>Полных связей</dt><dd>{n(gm.W_eval_edges)}</dd></div><div><dt>Ограничение</dt><dd>Этот граф не равен сокращённой картинке</dd></div></dl></article>
        <article className="rules-diag flex flex-col gap-2"><h3 className="tile-t !m-0">Сеть для чтения</h3><p>Объединение пяти самых сильных положительных связей каждого узла в union15, включая равные веса. Для SSE — общий фон сравнения.</p><dl className="rd-kv"><div><dt>Показано связей</dt><dd>{n(gm.shown)}</dd></div><div><dt>Координаты</dt><dd>Проекция уровня расходов и контраста с Total; остальные координаты на плоскости не видны</dd></div></dl></article>
      </div> },
    ]} />
  </Sec>
}

/** Декабрьская сеть общая для трёх моделей; единый кэш исключает повторные запросы. */
export function prefetchRuleNets() { prefetchNet(LEAD, MONTHS.at(-1)!.month) }
