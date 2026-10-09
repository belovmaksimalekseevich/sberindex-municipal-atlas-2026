import { AtlasSection, Opening } from './nat/ProtoNat'
import { StoryChapters } from './nat/Chapters'
import { Passport } from './nat/Passport'
import { FAR } from './nat/sceneData'
import './nat/nat.css'
import './nat/redesign.css'
import { Method, REPO, Reproduce } from './Method'
import { Methods } from './Methods'
import { Rules } from './Rules'
import { prefetchRuleNets } from './prefetchRules'
import { Quality } from './Quality'
import { DataNotes, Value } from './Closing'
import { SiteHeader } from './SiteHeader'
import { goTo } from './navigation'
import { SelectionProvider } from './state'
import { Bare, Sec, Tabs } from './nat/Head'
import { startTransition, useEffect, useState } from 'react'
import { ScrollTrigger } from './motion'
import { FULL_EVENT, page } from './nat/steps'
// по умолчанию в паспорте — герой истории (Иркутск): читатель видит знакомое МО
const defaultTi = FAR.best?.s ?? 0

/** Высота страницы меняется (разделы впервые отрисовываются по ходу прокрутки): пересчитываем точки срабатывания,
 *  но только после остановки прокрутки (ScrollTrigger «scrollEnd» + 200 мс тишины) и только при заметной смене высоты.
 *  Пересчёт читает раскладку всей страницы — посреди прокрутки он давал длинные кадры. */
function useRefreshOnResize() {
  useEffect(() => {
    let t = 0, lastH = document.body.offsetHeight, scrolling = false, pending = false
    const run = () => {
      t = 0
      if (scrolling) { pending = true; return }
      pending = false
      const h = document.body.offsetHeight
      if (Math.abs(h - lastH) < 24) return
      lastH = h; ScrollTrigger.refresh()
    }
    const schedule = () => { clearTimeout(t); t = window.setTimeout(run, 200) }
    const ro = new ResizeObserver(schedule)
    ro.observe(document.body)
    let st = 0
    const onScroll = () => { scrolling = true; clearTimeout(st); st = window.setTimeout(() => { scrolling = false; if (pending) schedule() }, 220) }
    addEventListener('scroll', onScroll, { passive: true })
    return () => { ro.disconnect(); clearTimeout(t); clearTimeout(st); removeEventListener('scroll', onScroll) }
  }, [])
}

/** Во время прокрутки холсты не принимают указатель: Chrome шлёт синтетические mousemove под неподвижным курсором,
 *  и каждая сеть или карта делала поиск точки и перерисовку на каждом шаге прокрутки. */
function useScrollingFlag() {
  useEffect(() => {
    const root = document.documentElement
    let t = 0
    const on = () => { if (!t) root.dataset.scrolling = '' ; clearTimeout(t); t = window.setTimeout(() => { t = 0; delete root.dataset.scrolling }, 160) }
    addEventListener('scroll', on, { passive: true })
    return () => { removeEventListener('scroll', on); clearTimeout(t) }
  }, [])
}

/** Всё ниже первого экрана монтируется после первой отрисовки, в фоновом (прерываемом) рендере React:
 *  первый экран появляется сразу, а 30 тыс. пикселей страницы строятся без длинной задачи.
 *  Если адрес ведёт к разделу (#rules), страница строится целиком сразу. */
function Rest() {
  useEffect(() => {
    page.full = true; ScrollTrigger.refresh(); dispatchEvent(new Event(FULL_EVENT))
    // ссылка вела к разделу (#rules): раздел появился только сейчас — переходим к нему
    const h = location.hash
    if (h.length > 1 && h !== '#top' && document.getElementById(h.slice(1))) requestAnimationFrame(() => goTo(h))
    // данные, которые иначе разбирались бы во время прокрутки, — в простое через пару секунд
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    const t = window.setTimeout(() => (ric ? ric(prefetchRuleNets, { timeout: 4000 }) : prefetchRuleNets()), 2000)
    return () => clearTimeout(t)
  }, [])
  return (
    <>
      {/* 01 История */}
      <StoryChapters />
      {/* 02 Атлас: карта по месяцам и портреты групп */}
      <AtlasSection />
      {/* 03 Найти МО */}
      <Passport />
      {/* 04 Сеть */}
      <Rules />
      {/* 05 Методы и ICVI */}
      <Sec id="methods" n="05" title="Какой способ сравнения лучше и как его оценить?"
        answer={<>NCut10 показывает десять подробных профилей, SSE10 позволяет сравнить методы при том же числе групп, SSE6 даёт укрупнённый обзор. Устойчивость, разделённость и содержательная детализация оцениваются отдельно.</>}>
        <Tabs label="Методы и индексы" items={[
          { id: 'methods-mean', label: 'Три представления: сравнение', body: <Bare><Methods part="table" /></Bare> },
          { id: 'methods-traits', label: 'Плюсы, минусы, когда применять', body: <Bare><Methods part="traits" /></Bare> },
          { id: 'quality', label: 'Шесть ICVI', body: <Bare><Quality /></Bare> },
        ]} />
      </Sec>
      {/* 06 Как получено */}
      <Sec id="how" n="06" title="Как это получено и чем полезно?"
        answer={<>От расходов жителей к сети похожих территорий, портретам групп и сравнению по месяцам. Здесь описаны метод, его проверки и способы использовать атлас.</>}>
        <Tabs label="Как получено" items={[
          { id: 'method', label: 'Шесть шагов от данных до смысла', body: <Bare><Method /></Bare> },
          { id: 'data', label: 'Данные и ограничения', body: <Bare><DataNotes /></Bare> },
          { id: 'value', label: 'Чем полезно', body: <Bare><Value /></Bare> },
          { id: 'reproduce', label: 'Как воспроизвести', body: <Reproduce /> },
        ]} />
      </Sec>
    </>
  )
}

export default function App() {
  useRefreshOnResize()
  useScrollingFlag()
  const [full, setFull] = useState(() => { try { return location.hash.length > 1 && location.hash !== '#top' } catch { return true } })
  useEffect(() => {
    if (full) return
    // после первой отрисовки: кадр + задача, затем фоновый рендер остального
    let t = 0
    const r = requestAnimationFrame(() => { t = window.setTimeout(() => startTransition(() => setFull(true)), 0) })
    return () => { cancelAnimationFrame(r); clearTimeout(t) }
  }, [full])
  return (
    <SelectionProvider defaultTi={defaultTi}>
      <a href="#main" className="sr-only bg-ink px-4 py-2 text-paper focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-40">К содержанию</a>
      <SiteHeader />
      <main id="main" className="p2 poster light nat">
        <Opening />
        {full && <Rest />}
      </main>
      <footer className="site-foot">
        <div className="in wrap-x">
          <div>
            <b>Сходство муниципалитетов</b>
            <p className="m-0">Конкурс СберИндекса 2026, номинация «Кластеризация». Расходы 2023–2024, NCut10 · SSE10 · SSE6.</p>
            <p className="m-0 mt-1">Репозиторий исследования: <a className="ink-link text-ink" href={REPO} target="_blank" rel="noreferrer">GitHub · код, данные и отчёт</a></p>
          </div>
          <div className="grid justify-items-start gap-2 self-end sm:justify-items-end">
            <a href="#top" className="pbtn">Наверх ↑</a>
          </div>
        </div>
      </footer>
    </SelectionProvider>
  )
}
