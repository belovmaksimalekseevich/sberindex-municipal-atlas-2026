import type { ReactNode } from 'react'
import { Sec } from './Head'
import { LAST, N, TRACK, monthIn, num, rub, rankOrder, rankColor } from './natdata'
import { FAR, StoryScene, groups, pairName, ratio, seen, vmax, vmin } from './Scene'
import { MONTHS } from '../data'
import { ChapterScrolly, chapterSteps } from './Chapters2'

// ---- описательная география групп: доля МО группы с большей медианой по крупным зонам (по координатам центров МО)
const geoStats = (() => {
  const lab = N.lab[LAST], cl = N.clusters[LAST], hi = rankOrder(cl)[0]
  const z = { north: [0, 0], east: [0, 0], rest: [0, 0], city: [0, 0], other: [0, 0] }
  N.terr.forEach((t, i) => {
    if (typeof lab[i] !== 'number') return
    const isHi = lab[i] === hi ? 1 : 0
    if (t.type) { const k = /городской округ/.test(t.type) ? 'city' : 'other'; z[k][0] += isHi; z[k][1]++ }
    if (!t.ll) return
    const k = t.ll[1] >= 90 || t.ll[1] < 0 ? 'east' : t.ll[0] >= 60 ? 'north' : 'rest'
    z[k][0] += isHi; z[k][1]++
  })
  const pct = (k: keyof typeof z) => Math.round((100 * z[k][0]) / (z[k][1] || 1))
  return { north: pct('north'), east: pct('east'), rest: pct('rest'), city: pct('city'), other: pct('other'), denominators: z }
})()


const n = (v: number) => v.toLocaleString('ru-RU')
const fb = FAR.best
// крайние МО по расходам и по доле общепита
const byLevel = [...seen].sort((a, b) => (N.obs[a] ?? 0) - (N.obs[b] ?? 0))
const EXT = [byLevel[0], byLevel[byLevel.length - 1]]
// герой главы 3: МО из далёкой пары, его соседи по сети; доля связей внутри одного региона
const SAME = (() => { let a = 0, b = 0; for (const [s0, t0] of N.edges) { const r1 = N.terr[s0].region, r2 = N.terr[t0].region; if (r1 && r2) { b++; if (r1 === r2) a++ } } return Math.round((100 * a) / (b || 1)) })()

/** Две группы бок о бок: медианы и во сколько раз различаются. */
function CmpGroups() {
  const a = groups[0], b = groups.at(-1)!
  return (
    <div className="cmp-groups">
      {[a, b].map(g => (
        <div key={g.g} className="cmp-g" style={{ borderTopColor: rankColorOf(g.g) }}>
          <span className="cmp-l">{g.name} · {n(g.size)} МО</span>
          <b>{rub(g.median[0])}</b><span className="cmp-l">медиана модельных месячных расходов</span>
        </div>
      ))}
      <div className="cmp-x"><b>×{num(ratio)}</b><span className="cmp-l">разница уровней</span></div>
    </div>
  )
}
const rankColorOf = (g: number) => rankColor(N.clusters[LAST], g)

/** Доля группы с большими расходами по зонам: столбики в одной шкале. */
function CmpZones() {
  const rows = [
    [`Север без востока (n=${geoStats.denominators.north[1]})`, geoStats.north], [`Восток (n=${geoStats.denominators.east[1]})`, geoStats.east], [`Остальная зона (n=${geoStats.denominators.rest[1]})`, geoStats.rest],
    [`Городские округа (n=${geoStats.denominators.city[1]})`, geoStats.city], [`Остальные типы (n=${geoStats.denominators.other[1]})`, geoStats.other],
  ] as const
  return (
    <div className="cmp-zones">
      <p className="cmp-h">Доля одной группы с максимальной медианой Total среди десяти</p>
      {rows.map(([t, v], k) => (
        <div key={t} className={`cmp-z ${k === 3 ? 'gap' : ''}`}><span>{t}</span><i><em style={{ width: `${v}%` }} /></i><b>{v}%</b></div>
      ))}
    </div>
  )
}

/** Далёкая пара: шесть показателей рядом — видно, почему в сети они соседи. */
function CmpPair() {
  if (!fb) return null
  const obs = MONTHS[MONTHS.length - 1].obs
  const a = obs[fb.s]?.[1] ?? [], b = obs[fb.t]?.[1] ?? []
  const cats = N.categories
  const max = cats.map((_, k) => Math.max(a[k] ?? 0, b[k] ?? 0) || 1)
  return (
    <div className="cmp-pair">
      <div className="cmp-ph"><b>{N.terr[fb.s].short}</b><span>{n(Math.round(fb.d / 100) * 100)} км</span><b>{N.terr[fb.t].short}</b></div>
      {cats.map((c, k) => (
        <div key={c.id} className="cmp-pr">
          <span className="v">{rub(a[k])}</span><i className="l"><em style={{ width: `${((a[k] ?? 0) / max[k]) * 100}%` }} /></i>
          <span className="c">{c.label}</span>
          <i className="r"><em style={{ width: `${((b[k] ?? 0) / max[k]) * 100}%` }} /></i><span className="v">{rub(b[k])}</span>
        </div>
      ))}
    </div>
  )
}

/** История (раздел 01): десять шагов в одном рассказе. Шаги 1–6 — одна canvas-сцена (облако → ряды → карта → связи → сеть),
 *  шаги 7–10 — графики. Картинка закреплена, шаги прокручиваются рядом. */
export function StoryChapters(): ReactNode {
  const g0 = groups[0], g1 = groups.at(-1)!
  const st = chapterSteps()
  const TOTAL = 10
  const L = (i: number, k: string) => `${i} из ${TOTAL} · ${k}`
  return (
    <Sec id="story" n="01" className="story-sec" title="Как муниципалитеты тратят и кто на кого похож?"
      answer={<>Фиксированный пример: NCut10, декабрь 2024, десять групп. Два крайних по медиане Total профиля различаются в {num(ratio)} раза. Сеть связывает похожие расходы; такие связи не означают денежные потоки. Выбор месяца и модели в интерактивных разделах ниже не меняет этот сюжет.</>}>
      <StoryScene chapter="" steps={[
        { k: L(1, 'Уровень'), scene: 'swarm', highlight: EXT, t: <>Каждая точка — наблюдаемый муниципалитет, их {n(seen.length)}. Чем правее, тем выше опубликованная модельная оценка средних безналичных расходов жителей: от <b>{rub(vmin)}</b> до <b>{rub(vmax)}</b> в {monthIn(N.months[LAST])}. Это расходы, не доходы населения. Крайние значения — «{N.terr[EXT[0]].short}» и «{N.terr[EXT[1]].short}».</> },
        { k: L(2, 'Десять групп'), scene: 'rows', cmp: <CmpGroups />, t: <>Метод выделяет десять групп по многомерному преобразованному профилю. Здесь сравним две крайние по медиане Total: G{g0.g} — {n(g0.size)} МО, <b>{rub(g0.median[0])}</b>; G{g1.g} — {n(g1.size)} МО, <b>{rub(g1.median[0])}</b>. Остальные восемь групп сохраняются. Группы определяет весь профиль, а не одна сумма.</> },
        { k: L(3, 'География'), scene: 'map', cmp: <CmpZones />, t: <>Те же наблюдения на карте, где есть геометрия. Для одной группы с максимальной медианой Total доли показаны среди доступных наблюдений каждой зоны. Восток — от 90° в. д. и западное полушарие; Север — от 60° с. ш. без уже отнесённых к востоку МО. Наличие географической закономерности не устанавливает функциональный экономический тип.</> },
        { k: L(4, 'Далёкие соседи'), scene: 'mapLinks', t: <>Показано объединение пяти сильнейших связей каждой вершины с равными весами на границе. Поэтому связей у отдельного МО может быть больше пяти. Среди {n(FAR.n)} показанных связей с известными координатами обоих центров <b>{Math.round(FAR.share * 100)}%</b> длиннее 1000 км.{fb && <> Например, <b>{pairName(fb.s)}</b> и <b>{pairName(fb.t)}</b> — около {n(Math.round(fb.d / 100) * 100)} км.</>} Среди связей с известными регионами {SAME}% соединяют один регион.</> },
        { k: L(5, 'Проекция профилей'), scene: 'graphPair', cmp: <CmpPair />, t: <>Покажем две сохранённые координаты профиля: уровень расходов и контраст выбранных категорий с Total. Это проекция X0/X1, а не раскладка по связям и не полная многомерная геометрия.{fb && <> Выделенная далёкая пара соединена ребром экономической близости; рядом приведены её исходные расходы.</>} Вид можно двигать и масштабировать.</> },
        { k: L(6, 'Группы в проекции'), scene: 'graphGroups', t: <>Цвет показывает присвоение NCut10. По этой двумерной картинке нельзя заключить, что все десять групп отделены в полном пространстве. Линии — экранное подмножество сети близости, не потоки и не все связи.</> },
      ]} />
      <ChapterScrolly chapter="" steps={[
        { ...st.ch4[2], k: L(7, 'Чем различаются') },
        { ...st.ch5[1], k: L(8, 'Состав во времени'), t: <>Группы соседних месяцев сопоставлены по максимальному пересечению на общих ID. ARI соседних разбиений: {TRACK.ariMin == null ? '—' : num(TRACK.ariMin, 2)}–{TRACK.ariMax == null ? '—' : num(TRACK.ariMax, 2)}, медиана {TRACK.ariMed == null ? '—' : num(TRACK.ariMed, 2)}. Среди {n(TRACK.total)} полных историй хотя бы одна смена у <b>{n(TRACK.switching)}</b> МО; ещё {n(N.terr.length - TRACK.total)} историй неполные. Цвета связывают присвоения, но не доказывают постоянные экономические типы.</> },
        { ...st.ch6[0], k: L(9, 'Подробно или укрупнённо') },
        { ...st.ch7[1], k: L(10, 'Надёжность') },
      ]} />
    </Sec>
  )
}
