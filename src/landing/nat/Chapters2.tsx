import { useEffect, useRef, useState, type ReactNode } from 'react'
import { reduced } from '../motion'
import { useSteps } from './steps'
import { LAST, N, monthLabel, num, rankColor, rankOrder, rub } from './natdata'
import { LEAD, MONTHS, base, median, groupColor, type ConfigMonth } from '../data'
import { stability } from '../Flow'
import supportRaw from '../i26/supporting_evidence.json'
import leadRaw from '../i26/lead.json'
import { MapCanvas } from './MapCanvas'

// ---------------------------------------------------------------------------------------------------------------
// Главы 04–07: тот же приём рассказа (картинка закреплена, шаги слева), но картинки — графики, а не точки.
// ---------------------------------------------------------------------------------------------------------------
export interface FigStep { k: string; t: ReactNode; fig: ReactNode }

/** Глава с закреплённой картинкой: для каждого шага — своя картинка (плавная смена). */
export function ChapterScrolly({ chapter, steps }: { chapter: string; steps: FigStep[] }) {
  const [step, setStep] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  useSteps(root, setStep)
  return (
    <div ref={root} className="story">
      <div className="story-fig"><div className="w-full scene-cmp" key={step}>{steps[step].fig}</div></div>
      <div className="story-steps">
        {steps.map((s, i) => (
          <section key={i} data-step={i} className={`story-step ${i === step ? 'on' : ''}`}>
            <p className="story-k">{chapter ? `${chapter} · ` : ""}{s.k}</p>
            <p>{s.t}</p>
          </section>
        ))}
      </div>
    </div>
  )
}

const n = (v: number) => v.toLocaleString('ru-RU')
const cl = N.clusters[LAST], order = rankOrder(cl)
const HI = cl.find(c => c.g === order[0])!, LO = cl.find(c => c.g === order.at(-1))!
const lastObs = MONTHS[MONTHS.length - 1].obs
const med = (a: number[]) => median(a)
/** Медиана всех наблюдённых МО по каждому показателю — база для «отклонения от типичного МО». */
const ALL = N.categories.map((_, k) => med(lastObs.flatMap(o => (o && o[0] === 'observed' && o[1][k] != null ? [o[1][k] as number] : []))))
const dev = (g: (typeof cl)[number], k: number) => ((g.median[k] ?? 0) / (ALL[k] || 1) - 1) * 100

// ---- 04: отклонения профиля группы от медианы всех МО
function DevBars({ groups, title }: { groups: (typeof cl)[number][]; title: string }) {
  const MAXP = Math.max(100, ...groups.flatMap(g => N.categories.map((_, k) => Math.abs(dev(g, k)))))
  return (
    <figure className="m-0">
      <p className="scene-title">{title}</p>
      <p className="fig-sub">отклонение медианы группы от медианы всех МО, {monthLabel(N.months[LAST])}</p>
      <div className="devbars">
        {N.categories.map((c, k) => (
          <div key={c.id} className="db-row">
            <span className="db-l">{c.label}</span>
            <div className="db-track">
              <i className="db-zero" />
              {groups.map((g, gi) => { const d = dev(g, k), w = (Math.abs(d) / MAXP) * 50; return (
                <span key={g.g} className="db-bar" style={{ left: d >= 0 ? '50%' : `${50 - w}%`, width: `${w}%`, background: rankColor(cl, g.g), top: groups.length > 1 ? `${gi * 50}%` : '15%', height: groups.length > 1 ? '46%' : '70%' }}>
                  <b className={d >= 0 ? 'r' : 'l'}>{d >= 0 ? '+' : '−'}{Math.abs(Math.round(d))}%</b>
                </span>) })}
            </div>
          </div>
        ))}
      </div>
      <ul className="scene-legend">{groups.map(g => <li key={g.g}><i style={{ background: rankColor(cl, g.g) }} />{g.name}: {n(g.size)} МО, медиана {rub(g.median[0])}</li>)}</ul>
    </figure>
  )
}

// ---- 05: сохранённое сопоставление соседних месяцев, без мостов через пропуски.
const lead = leadRaw as unknown as ConfigMonth[]
const TEMPORAL = stability(LEAD, lead)
const RANK = lead.map(m => m.display_group)
const SW = TEMPORAL.rows.map(r => r.switches)
const KIND = { top: TEMPORAL.rows.filter(r => r.kind === 'top').length, sw: TEMPORAL.rows.filter(r => r.kind === 'switch').length, bottom: TEMPORAL.rows.filter(r => !r.complete).length }
const HIST = (() => { const h = new Map<number, number>(); TEMPORAL.rows.filter(r => r.complete && r.switches > 0).forEach(r => h.set(r.switches, (h.get(r.switches) ?? 0) + 1)); return [...h.entries()].sort((a, b) => a[0] - b[0]) })()
const switchColor = (k: number) => (k <= 1 ? '#FFD23F' : k === 2 ? '#FF9F1C' : k <= 4 ? '#F0562B' : '#8C1C13')
const topSwitch = N.terr.map((_, i) => i).filter(i => SW[i]).sort((a, b) => SW[b]! - SW[a]!).slice(0, 3)

/** История фиксированного NCut10; цвета связаны сохранёнными межмесячными соответствиями. */
function MonthMap() {
  const [mi, setMi] = useState(0)
  const fig = useRef<HTMLElement>(null)
  // проигрывание только пока карта на экране: вне экрана каждая смена месяца — перерисовка 2,6 тыс. контуров впустую
  useEffect(() => {
    if (reduced()) { setMi(LAST); return }
    let t = 0
    const io = new IntersectionObserver(es => {
      const on = es[es.length - 1].isIntersecting
      clearInterval(t); t = 0
      // вкладка скрыта — месяц не меняется (перерисовки впустую)
      if (on) t = window.setInterval(() => { if (!document.hidden) setMi(m => (m + 1) % N.months.length) }, 650)
    })
    io.observe(fig.current!)
    return () => { io.disconnect(); clearInterval(t) }
  }, [])
  return (
    <figure ref={fig} className="m-0">
      <p className="scene-title">{monthLabel(N.months[mi])}</p>
      <p className="fig-sub">NCut10: сопоставленные цвета групп; серый — нет присвоения. Цвет не задаёт постоянный тип.</p>
      <MapCanvas version={mi} budget={0.45e6} label={`Карта групп, ${monthLabel(N.months[mi])}`} fill={ti => { const r = RANK[mi][ti]; return r == null ? '#D9DCE3' : groupColor(r) }} />
      <div className="month-ticks" aria-hidden>{N.months.map((m, i) => <i key={m} className={i === mi ? 'on' : ''} />)}</div>
    </figure>
  )
}
function Kinds() {
  const maxH = Math.max(1, ...HIST.map(h => h[1]))
  return (
    <figure className="m-0">
      <p className="scene-title">24 месяца каждого МО</p>
      <div className="kinds">
        <div style={{ flexGrow: KIND.top, background: 'var(--g2)', color: '#fff' }}><b>{n(KIND.top)}</b><span>полная история без смен</span></div>
        <div style={{ flexGrow: KIND.sw, background: 'var(--mark)' }}><b>{n(KIND.sw)}</b><span>полная история со сменами</span></div>
        <div style={{ flexGrow: KIND.bottom, background: 'var(--g1)', color: '#fff' }}><b>{n(KIND.bottom)}</b><span>неполная история</span></div>
      </div>
      <p className="scene-title mt-6">Смены среди полных историй</p>
      <div className="hist">{HIST.map(([k, v]) => <div key={k} className="h-row"><span>{k}×</span><i><em style={{ width: `${(v / maxH) * 100}%`, background: switchColor(k) }} /></i><b>{v}</b></div>)}</div>
    </figure>
  )
}
function SwitchMapLite() {
  return (
    <figure className="m-0">
      <p className="scene-title">Где меняли группу</p>
      <p className="fig-sub">Наблюдаемые смены на соседних общих месяцах; разрывы истории не считаются устойчивостью.</p>
      <MapCanvas still label="Карта смен группы" fill={ti => { const k = SW[ti] ?? 0; return k > 0 ? switchColor(k) : '#E4E7EC' }} />
      <ul className="scene-legend">{[1, 2, 3, 5].map(k => <li key={k}><i style={{ background: switchColor(k), borderRadius: 0 }} />{k === 5 ? '5+ раз' : k === 3 ? '3–4 раза' : k === 2 ? '2 раза' : '1 раз'}</li>)}</ul>
    </figure>
  )
}

// ---- 06: три принятых метода в общем пространстве признаков.
function Reps() {
  const roles: Record<string, string> = { NCut: 'сеть и подробные профили', SSE10: 'контроль при том же числе групп', SSE6: 'отдельный укрупнённый взгляд' }
  return <figure className="m-0"><p className="scene-title">Подробно или укрупнённо</p><p className="fig-sub">Три принятые модели. SW декабря 2024 описывает геометрию; сравнение разных K само по себе не выбирает победителя.</p><div className="reps">
    {base.catalog.filter(c => ['NCut', 'SSE'].includes(c.fit_method)).map(c => { const row = base.metrics[LAST].find(x => x.id === c.config_id), sw = row?.metrics.find(m => m.id === 'SW')?.value; return <div key={c.config_id} className={`rep ${c.config_id === LEAD ? 'on' : ''}`}><b className="rep-t">{c.fit_method}{c.K}</b><span className="rep-s">{roles[c.fit_method === 'NCut' ? 'NCut' : `SSE${c.K}`]}</span><span className="rep-n">{c.K}</span><span className="rep-s">групп</span><i className="rep-bar"><em style={{ width: `${Math.max(0, sw ?? 0) * 100}%` }} /></i><span className="rep-s">SW: {sw == null ? 'не определён' : num(sw, 3)}</span></div> })}
  </div></figure>
}
type Stat = { mean_ARI: number; minimum_draw_ARI: number; mean_macro_Jaccard: number; minimum_draw_macro_Jaccard: number }
const support = supportRaw as unknown as { subsample_stability: { SSE6: { month: string; all10_statistics: Stat }[]; K10: ({ month: string; method: string } & Stat)[] } }
function Subsample() {
  return <figure className="m-0"><p className="scene-title">Пересчёт на 80% муниципалитетов</p><p className="fig-sub">Два контрольных месяца, по 10 подвыборок. Сводки для целых разбиений; индивидуальная частота возврата МО здесь не оценена.</p><div className="subs">
    {['2024-06', '2024-12'].map(month => { const coarse = support.subsample_stability.SSE6.find(x => x.month === month)!.all10_statistics; const rows = [...support.subsample_stability.K10.filter(x => x.month === month).map(x => ({ name: `${x.method}10`, ...x })), { name: 'SSE6', ...coarse }]; return <div key={month} className="sub"><span className="rep-s">{monthLabel(month)}</span>{rows.map(x => <div key={x.name}><b>{x.name}<small> · ARI {num(x.mean_ARI, 3)}</small></b><i className="rep-bar"><em style={{ width: `${x.mean_ARI * 100}%` }} /></i><span className="rep-s">ARI: среднее {num(x.mean_ARI, 3)}, минимум {num(x.minimum_draw_ARI, 3)}; macro-J: среднее {num(x.mean_macro_Jaccard, 3)}, минимум {num(x.minimum_draw_macro_Jaccard, 3)}.</span></div>)}</div> })}
  </div></figure>
}
/** Сюжет остаётся фиксированным NCut10 / декабрь 2024; активные экраны ниже управляются выбором. */
export function chapterSteps() {
  const ratios = N.categories.map((c, k) => ({ c, r: (HI.median[k] ?? 0) / (LO.median[k] || 1) })).filter(x => x.c.role === 'category')
  const maxR = ratios.reduce((a, b) => b.r > a.r ? b : a), minR = ratios.reduce((a, b) => b.r < a.r ? b : a)
  return {
    ch4: [
      { k: 'Верхняя из десяти по Total', fig: <DevBars groups={[HI]} title={`${HI.name}: измеренный профиль`} />, t: <>Группа G{HI.g}, {n(HI.size)} МО: медиана общих расходов {rub(HI.median[0])}. Это верхняя медиана среди десяти групп NCut10, а не единственная группа повышенных расходов.</> },
      { k: 'Нижняя из десяти по Total', fig: <DevBars groups={[LO]} title={`${LO.name}: измеренный профиль`} />, t: <>Группа G{LO.g}, {n(LO.size)} МО: медиана {rub(LO.median[0])}. Сравниваем два крайних профиля из десяти; остальные восемь сохраняют отдельные сочетания признаков.</> },
      { k: 'Два крайних профиля', fig: <DevBars groups={[HI, LO]} title="Два примера из десяти групп NCut10" />, t: <>У двух крайних по Total групп сильнее всего различаются медианы «{maxR.c.label.toLowerCase()}» — в <b>{num(maxR.r)} раза</b>, слабее всего «{minR.c.label.toLowerCase()}» — в {num(minR.r)} раза. Это сравнение медиан выбранных групп, не каждого их участника. Функциональные экономические типы не установлены.</> },
    ] as FigStep[],
    ch5: [
      { k: 'Месяц за месяцем', fig: <MonthMap />, t: <>NCut10 пересчитывается в каждом месяце. Цвета сопоставлены по максимуму пересечения групп на общих ID соседних месяцев; номера исходных групп не сравниваются напрямую.</> },
      { k: 'Полные и неполные истории', fig: <Kinds />, t: <><b>{n(KIND.top)}</b> МО имеют полную историю без смен после сопоставления, <b>{n(KIND.sw)}</b> — полную историю со сменами. Ещё <b>{n(KIND.bottom)}</b> имеют пропуски. Отсутствие наблюдаемой смены в неполной истории не означает устойчивость все 24 месяца.</> },
      { k: 'Наблюдаемые смены', fig: <SwitchMapLite />, t: <>Смена считается только между соседними месяцами, когда ID есть в обоих. Больше всего наблюдаемых смен: {topSwitch.map(i => `${N.terr[i].short} (${SW[i]})`).join(', ')}. Карта описывает присвоения модели, не причины экономических изменений.</> },
    ] as FigStep[],
    ch6: [{ k: 'Подробность и цена укрупнения', fig: <Reps />, t: <>NCut10 — основной подробный взгляд на сеть; SSE10 — обязательный контроль при том же K. SSE6 устойчивее по среднему ARI двух контрольных месяцев, но объединяет разные профили: участники исходных групп NCut10 G6, G8 и G9 (291 МО) входят в одну группу SSE6 из 333 МО. SSE6 — отдельный вариант, не шесть родительских типов для десяти.</> }] as FigStep[],
    ch7: [
      { k: 'Разные вопросы качества', fig: <Subsample />, t: <>Геометрические индексы, пересчёт на подвыборках и изменения во времени отвечают на разные вопросы. Высокая устойчивость не доказывает содержательную однородность каждой группы.</> },
      { k: 'Подвыборки', fig: <Subsample />, t: <>Для июня и декабря 2024 убирали 20% МО и заново рассчитывали нормировку, сеть и разбиения. По десять проверок каждого метода. SSE6 устойчивее в среднем, однако исходная проблемная группа NCut10 G7 не восстановлена целиком; её геометрия при SSE6 хуже SSE10 во всех десяти декабрьских подвыборках. Это границы результата, не вероятность «правильного» типа.</> },
    ] as FigStep[],
  }
}
