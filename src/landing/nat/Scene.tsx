import { useEffect, useRef, useState, type ReactNode } from 'react'
import { scaleOf } from '../zoom'
import { reduced } from '../motion'
import { LAST, N, clusterOf, rankColor, rankOrder, rub } from './natdata'
import { cssColor } from '../canvasNet'
import { useSteps } from './steps'
import { MONTHS } from '../data'
import { H, MAPY, SCENE, SceneRenderer, W, sceneSwarms, setSceneData, type SceneData, type SceneKey, type StepMsg, type View } from './sceneCore'
import type { ToWorker } from './sceneWorker'
import { canvasWorker, ensureLocalPaths, failCanvasWorker, onWorker, toWorker, useWorkerFailed } from './workerHost'
import golosLat from '@fontsource-variable/golos-text/files/golos-text-latin-wght-normal.woff2?url'
import golosCyr from '@fontsource-variable/golos-text/files/golos-text-cyrillic-wght-normal.woff2?url'
import golosExt from '@fontsource-variable/golos-text/files/golos-text-latin-ext-wght-normal.woff2?url'
import monoLat from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url'
import monoCyr from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-cyrillic-wght-normal.woff2?url'
import monoExt from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2?url'
import firaLat from '@fontsource/fira-sans-extra-condensed/files/fira-sans-extra-condensed-latin-800-normal.woff2?url'
import firaCyr from '@fontsource/fira-sans-extra-condensed/files/fira-sans-extra-condensed-cyrillic-800-normal.woff2?url'

// ---------------------------------------------------------------------------------------------------------------
// Данные вступительных сцен: фиксированные NCut10, декабрь 2024. Здесь — только числа и тексты для глав;
// раскладки облака и отрисовка — в sceneCore (в фоновом потоке, если браузер умеет OffscreenCanvas).
// ---------------------------------------------------------------------------------------------------------------
const PADX = 60
type Pt = { x: number; y: number }

export const lab = N.lab[LAST], cl = N.clusters[LAST], order = rankOrder(cl)
export const val = (ti: number) => N.obs[ti]
export const seen = N.terr.map((_, i) => i).filter(i => val(i) != null && typeof lab[i] === 'number')
const sorted = seen.map(i => val(i)!).sort((a, b) => a - b)
export const vmin = sorted[0], vmax = sorted[sorted.length - 1]
const lo = sorted[Math.floor(sorted.length * 0.005)], hi = sorted[Math.ceil(sorted.length * 0.995) - 1]
const X = (v: number) => PADX + Math.max(0, Math.min(1, (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)))) * (W - 2 * PADX)
const ticks = [15000, 20000, 25000, 30000, 40000, 50000, 60000].filter(t => t >= lo && t <= hi)
const rowY = (r: number) => 64 + r * (H - 160) / Math.max(1, order.length - 1)
export const groups = order.map(g => clusterOf(cl, g)!)
export const ratio = (groups[0].median[0] ?? 0) / (groups[groups.length - 1].median[0] || 1)
export const missing = N.terr.length - seen.length
const lastObs = MONTHS[MONTHS.length - 1].obs
export const shareOf = (i: number) => { const o = lastObs[i]; return o && o[1][0] && o[1][3] != null ? (o[1][3] as number) / (o[1][0] as number) : null }

const NT = N.terr.length
const GEO = new Float32Array(2 * NT).fill(NaN), NET = new Float32Array(2 * NT).fill(NaN)
N.geo.forEach((p, i) => { if (p) { GEO[2 * i] = p[0]; GEO[2 * i + 1] = p[1] + MAPY } })
N.xy.forEach((p, i) => { if (p) { NET[2 * i] = 60 + p[0] * (W - 120); NET[2 * i + 1] = 30 + p[1] * (H - 80) } })
const has = (a: Float32Array, i: number) => !Number.isNaN(a[2 * i])
export const noGeo = seen.filter(i => !has(GEO, i)).length

const kmBetween = (a: [number, number], b: [number, number]) => {
  const Re = 6371, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r
  return 2 * Re * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2))
}
// Доля среди отображённых рёбер с LL обоих концов. SVG-координаты geo не являются широтой/долготой.
// Пример пары выбирается среди сильных связей (верхняя четверть по весу), доступных и на карте, и в проекции.
export const FAR = (() => {
  const km = (a: [number, number], b: [number, number]) => {
    const Re = 6371, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2
    return 2 * Re * Math.asin(Math.sqrt(h))
  }
  const ws = N.edges.map(e => e[2]).sort((a, b) => a - b), wq = ws[Math.floor(ws.length * 0.75)]
  let n = 0, far = 0, best: { s: number; t: number; d: number } | null = null
  for (const [s0, t0, w] of N.edges) {
    const a = N.terr[s0].ll, b = N.terr[t0].ll
    if (!a || !b) continue
    const d = km(a, b); n++; if (d > 1000) far++
    if (w >= wq && has(GEO, s0) && has(GEO, t0) && has(NET, s0) && has(NET, t0) && (!best || d > best.d)) best = { s: s0, t: t0, d }
  }
  return { share: n ? far / n : 0, n, farN: far, totalEdges: N.edges.length, unknownCoordinateEdges: N.edges.length - n, best }
})()
const fb = FAR.best
export const pairName = (i: number) => `${N.terr[i].short}${N.terr[i].region ? ` (${N.terr[i].region})` : ''}`

/** Пакет данных для отрисовки (собирается один раз, когда первая сцена подходит к экрану). */
function buildData(el: Element): SceneData {
  const shareRank = (() => { const v = seen.map(i => [i, shareOf(i) ?? 0] as const).sort((a, b) => a[1] - b[1]); return new Map(v.map(([i], k) => [i, k / (v.length - 1)])) })()
  const colors: Record<number, string> = {}
  cl.forEach(c => { colors[c.g] = cssColor(el, rankColor(cl, c.g)) })
  const xv = new Float32Array(NT).fill(NaN), labA = new Int16Array(NT).fill(-1), row = new Int8Array(NT).fill(-1), shareStep = new Uint8Array(NT)
  for (const i of seen) {
    xv[i] = X(val(i)!); labA[i] = lab[i] as number; row[i] = order.indexOf(lab[i] as number)
    shareStep[i] = Math.min(5, Math.floor((shareRank.get(i) ?? 0) * 6))
  }
  const edges = new Int32Array(2 * N.edges.length), far = new Uint8Array(N.edges.length), bundle = new Uint8Array(N.edges.length)
  const reg = fb ? N.terr[fb.s].region : null
  N.edges.forEach((e, k) => {
    edges[2 * k] = e[0]; edges[2 * k + 1] = e[1]
    const a = N.terr[e[0]].ll, b = N.terr[e[1]].ll
    if (a && b && kmBetween(a, b) > 1000) { far[k] = 1; if (reg && (N.terr[e[0]].region === reg || N.terr[e[1]].region === reg)) bundle[k] = 1 }
  })
  return {
    n: NT, seen: Int32Array.from(seen), xv, lab: labA, row, geo: GEO, net: NET, shareStep, edges, far, bundle, colors,
    short: N.terr.map(t => t.short),
    axis: { ticks: ticks.map(t => ({ x: X(t), label: `${Math.round(t / 1000)} тыс.` })), title: 'Модельные средние расходы жителей, ₽; лог. шкала', missing: missing > 0 ? `нет публикации за месяц: ${missing} МО (не ноль) — не показаны` : '' },
    rows: groups.map((g, r) => ({ y: rowY(r), label: `G${g.g} · ${g.size.toLocaleString('ru-RU')} МО`, color: colors[g.g], xm: X(g.median[0]), median: `${rub(g.median[0])}` })),
    rowYs: groups.map((_, r) => rowY(r)),
    pair: fb ? { s: fb.s, t: fb.t } : null,
  }
}
const FONTS = [
  ...[[golosLat, 'lat'], [golosCyr, 'cyr'], [golosExt, 'ext']].map(([url, r]) => ({ family: 'Golos Text Variable', url, range: r, weight: '400 900' })),
  ...[[monoLat, 'lat'], [monoCyr, 'cyr'], [monoExt, 'ext']].map(([url, r]) => ({ family: 'JetBrains Mono Variable', url, range: r, weight: '100 800' })),
  ...[[firaLat, 'lat'], [firaCyr, 'cyr']].map(([url, r]) => ({ family: 'Fira Sans Extra Condensed', url, range: r, weight: '800' })),
].map(f => ({ ...f, range: f.range === 'lat' ? 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' : f.range === 'cyr' ? 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116' : 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' }))

// ---------------------------------------------------------------------------------------------------------------
// Связь с отрисовкой: фоновый поток (один на все сцены) или, без OffscreenCanvas, тот же код в основном потоке.
// ---------------------------------------------------------------------------------------------------------------
type Cmd = Exclude<ToWorker, { type: 'data' } | { type: 'init' }> extends infer M ? (M extends { id: number } ? Omit<M, 'id'> : never) : never
interface Handle { send: (m: Cmd) => void }
const swarmPos: { one: Float32Array | null; split: Float32Array | null } = { one: null, split: null }
const viewSubs = new Map<number, (v: View) => void>()
let dataSent = false
let localReady = false
const localScenes = new Map<number, SceneRenderer>()
let nextId = 1

// холст передаётся в поток один раз: при повторном монтировании (StrictMode, горячая замена) берём прежнюю связь
const HANDLES = new WeakMap<HTMLCanvasElement, { id: number; h: Handle }>()
function openScene(cv: HTMLCanvasElement, first: SceneKey, onView: (v: View) => void): Handle {
  const old = HANDLES.get(cv)
  if (old) { viewSubs.set(old.id, onView); return old.h }
  const h = openNew(cv, first, onView)
  HANDLES.set(cv, h)
  return h.h
}
function openNew(cv: HTMLCanvasElement, first: SceneKey, onView: (v: View) => void): { id: number; h: Handle } {
  const id = nextId++
  viewSubs.set(id, onView)
  const worker = canvasWorker()
  if (worker) {
    if (!dataSent) {
      dataSent = true
      onWorker(m => {
        if (m.type === 'swarms') { swarmPos.one = m.one; swarmPos.split = m.split }
        else if (m.type === 'view') viewSubs.get(m.id)?.(m.view)
      })
      const data = buildData(cv)
      // пакет копируется в поток (структурное клонирование); основной поток оставляет себе GEO/NET
      toWorker({ type: 'data', data, fonts: FONTS } satisfies ToWorker)
    }
    try {
      const off = cv.transferControlToOffscreen()
      toWorker({ type: 'init', id, canvas: off, first } satisfies ToWorker, [off])
    } catch {
      failCanvasWorker()
    }
    return { id, h: { send: m => { toWorker({ ...m, id }) } } }
  }
  // запасной путь: отрисовка в основном потоке
  if (!localReady) {
    localReady = true
    ensureLocalPaths()
    setSceneData(buildData(cv))
    const ric: (f: () => void) => void = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? (f => setTimeout(f, 200))
    ric(() => { const sw = sceneSwarms(); swarmPos.one = sw.one; swarmPos.split = sw.split; localScenes.forEach(s => s.swarmsReady()) })
  }
  const r = new SceneRenderer(cv, first, v => viewSubs.get(id)?.(v))
  localScenes.set(id, r)
  return { id, h: {
    send: m => {
      switch (m.type) {
        case 'size': r.resize(m.w, m.dpr); break
        case 'vis': r.setVisible(m.on); break
        case 'step': r.setStep(m.step); break
        case 'view': r.setView(m.view, m.animate); break
        case 'touch': r.touch(); break
        case 'hover': r.setHover(m.i); break
        case 'node': r.moveNode(m.i, m.x, m.y); break
        case 'reset': r.resetNet(m.reduced); break
        case 'drop': r.setVisible(false); localScenes.delete(id); viewSubs.delete(id); break
      }
    },
  } }
}

export interface Step { k: string; scene: SceneKey; t: ReactNode; cmp?: ReactNode
  /** МО с подписями (кольцо и название) */
  highlight?: number[]
  /** МО-центр: от него линии к подсвеченным соседям */
  star?: number
  /** приблизить камеру к подсвеченным МО (только для графа) */
  zoomTo?: boolean }

const K_MIN = 0.6, K_MAX = 12

/** Глава-рассказ на canvas: закреплённая картинка справа, карточки шагов слева. Переход между шагами — интерполяция
 *  координат и плавное появление слоёв (кадры рисует фоновый поток). На шагах с графом его можно масштабировать,
 *  двигать и перетаскивать точки. */
export function StoryScene({ chapter, steps }: { chapter: string; steps: Step[] }) {
  const [step, setStep] = useState(0)
  const workerFailed = useWorkerFailed()
  const [showGroups, setShowGroups] = useState(false)
  useEffect(() => setShowGroups(false), [step])
  const root = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const zoomEl = useRef<HTMLSpanElement>(null)
  const sk = steps[step].scene, scene = SCENE[sk]
  const interactive = scene.pos === 'net'
  const h = useRef<Handle | null>(null)
  // основной поток знает камеру, размер и положения точек графа — для подсказок, масштаба и перетаскивания
  const S = useRef({ view: { x: 0, y: 0, k: 1 } as View, w: 0, net: NET.slice(), hover: null as number | null })

  useEffect(() => {
    const el = cv.current!
    S.current.w = 0
    const hd = openScene(el, steps[0].scene, v => { S.current.view = v; if (zoomEl.current) zoomEl.current.textContent = `${Math.round(v.k * 100)}%` })
    h.current = hd
    const ro = new ResizeObserver(() => { const w = el.clientWidth; if (w !== S.current.w) { S.current.w = w; el.style.height = `${(w * H) / W}px`; hd.send({ type: 'size', w, dpr: (window.devicePixelRatio || 1) * scaleOf(el) }) } })
    ro.observe(el)
    // холст рисуется, только когда сцена у экрана; вне экрана поток освобождает его память
    const io = new IntersectionObserver(es => hd.send({ type: 'vis', on: es[es.length - 1].isIntersecting }), { rootMargin: '40% 0px' })
    io.observe(root.current!)
    return () => { ro.disconnect(); io.disconnect(); hd.send({ type: 'vis', on: false }); h.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerFailed])
  useSteps(root, setStep)
  useEffect(() => {
    const s = steps[step], L = SCENE[s.scene]
    if (L.pos !== 'net') S.current.net = NET.slice()
    const msg: StepMsg = {
      idx: step, scene: s.scene, highlight: s.highlight ?? null, star: s.star ?? null, showGroups, reduced: reduced(),
      view: s.scene === 'graphPair' ? 'pair' : s.scene === 'graphFocus' && s.zoomTo ? 'focus' : 'reset',
      animateView: s.scene === 'graphPair' ? step > 0 : s.scene === 'graphFocus' ? true : L.pos === 'net',
    }
    h.current?.send({ type: 'step', step: msg })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, showGroups, workerFailed])

  // ---- взаимодействие (только шаги с графом): масштаб, сдвиг, перетаскивание; подсказка — на всех шагах
  const posNow = (): Float32Array | null => {
    const p = SCENE[steps[step].scene].pos
    return p === 'net' ? S.current.net : p === 'geo' ? GEO : swarmPos[p]
  }
  const local = (cx: number, cy: number) => { const r = cv.current!.getBoundingClientRect(), z = scaleOf(cv.current!); return { x: (cx - r.left) / z, y: (cy - r.top) / z } }
  const nearestAt = (p: Pt, radius: number) => {
    const pos = posNow(); if (!pos) return null
    const st = S.current, k = (st.w / W) * st.view.k
    const wx = (p.x - st.view.x) / k, wy = (p.y - st.view.y) / k, r2 = (radius / k) ** 2
    let best: number | null = null, bd = r2
    for (const i of seen) { const x = pos[2 * i]; if (Number.isNaN(x)) continue; const d = (x - wx) ** 2 + (pos[2 * i + 1] - wy) ** 2; if (d < bd) { bd = d; best = i } }
    return best
  }
  const setView = (v: View) => { S.current.view = v; if (zoomEl.current) zoomEl.current.textContent = `${Math.round(v.k * 100)}%`; h.current?.send({ type: 'view', view: v, animate: false }) }
  const zoomAt = (sx: number, sy: number, f: number) => {
    const v = S.current.view, k = Math.min(K_MAX, Math.max(K_MIN, v.k * f))
    h.current?.send({ type: 'touch' })
    setView({ k, x: sx - (sx - v.x) * (k / v.k), y: sy - (sy - v.y) * (k / v.k) })
  }
  // блокирующий обработчик колеса — только на шагах с графом, и он реагирует только на Ctrl/⌘
  const zoomRef = useRef(zoomAt); zoomRef.current = zoomAt
  useEffect(() => {
    if (!interactive) return
    const el = cv.current!
    const on = (e: WheelEvent) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); const p = local(e.clientX, e.clientY); zoomRef.current(p.x, p.y, Math.exp(-e.deltaY * 0.01)) }
    el.addEventListener('wheel', on, { passive: false })
    return () => el.removeEventListener('wheel', on)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive])
  // подсказка и кольцо под курсором — DOM поверх холста: наведение не перерисовывает сцену
  const tipEl = useRef<HTMLDivElement>(null), ringEl = useRef<HTMLSpanElement>(null)
  const sentHover = useRef<number | null>(null)
  const placeHover = () => {
    const st = S.current, tip = tipEl.current, ring = ringEl.current, pos = posNow()
    if (!tip || !ring) return
    const i = st.hover
    if (sentHover.current !== i) { sentHover.current = i; h.current?.send({ type: 'hover', i }) }
    if (i == null || !pos || Number.isNaN(pos[2 * i])) { tip.hidden = true; ring.hidden = true; return }
    const t = N.terr[i], sc = st.w / W, v = st.view
    const sx = pos[2 * i] * sc * v.k + v.x, sy = pos[2 * i + 1] * sc * v.k + v.y
    const text = `${t.name}${t.region ? `, ${t.region}` : ''}: ${rub(val(i))}`
    if (tip.textContent !== text) tip.textContent = text
    tip.hidden = false; ring.hidden = false
    tip.style.transform = `translate(${Math.round(Math.max(4, Math.min(sx + 10, st.w - tip.offsetWidth - 4)))}px, ${Math.round(sy + 10)}px)`
    ring.style.transform = `translate(${Math.round(sx - 7)}px, ${Math.round(sy - 7)}px)`
  }
  const hoverPt = useRef<Pt | null>(null), hoverRaf = useRef(0)
  useEffect(() => () => cancelAnimationFrame(hoverRaf.current), [])
  const ptrs = useRef(new Map<number, Pt>())
  const drag = useRef<{ i: number | null; last: Pt } | null>(null)
  const pinch = useRef<number | null>(null)
  const onDown = (e: React.PointerEvent) => {
    if (!interactive) return
    h.current?.send({ type: 'touch' })
    cv.current!.setPointerCapture(e.pointerId)
    const p = local(e.clientX, e.clientY); ptrs.current.set(e.pointerId, p)
    if (ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; pinch.current = Math.hypot(a.x - b.x, a.y - b.y); drag.current = null; return }
    drag.current = { i: nearestAt(p, 12), last: p }
  }
  const onMove = (e: React.PointerEvent) => {
    const p = local(e.clientX, e.clientY), st = S.current
    if (!ptrs.current.has(e.pointerId)) {
      hoverPt.current = p
      if (!hoverRaf.current) hoverRaf.current = requestAnimationFrame(() => { hoverRaf.current = 0; const q = hoverPt.current; if (!q) return; const n = nearestAt(q, 8); if (n !== st.hover) { st.hover = n; placeHover() } })
      return
    }
    ptrs.current.set(e.pointerId, p)
    if (pinch.current != null && ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()], d = Math.hypot(a.x - b.x, a.y - b.y); zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.current); pinch.current = d; return }
    const g = drag.current; if (!g) return
    const dx = p.x - g.last.x, dy = p.y - g.last.y; g.last = p
    if (g.i == null) setView({ ...st.view, x: st.view.x + dx, y: st.view.y + dy })
    else { const k = (st.w / W) * st.view.k, nx = st.net[2 * g.i] + dx / k, ny = st.net[2 * g.i + 1] + dy / k; st.net[2 * g.i] = nx; st.net[2 * g.i + 1] = ny; h.current?.send({ type: 'node', i: g.i, x: nx, y: ny }) }
    if (st.hover != null) placeHover()
  }
  const onUp = (e: React.PointerEvent) => { ptrs.current.delete(e.pointerId); if (ptrs.current.size < 2) pinch.current = null; drag.current = null }
  const reset = () => { S.current.net = NET.slice(); h.current?.send({ type: 'reset', reduced: reduced() }) }
  const toPair = () => {
    if (!fb) return
    const st = S.current, sc = st.w / W, a = st.net, k = 4, hh = (st.w * H) / W
    const cx = (a[2 * fb.s] + a[2 * fb.t]) / 2, cy = (a[2 * fb.s + 1] + a[2 * fb.t + 1]) / 2
    setView({ k, x: st.w / 2 - cx * sc * k, y: hh / 2 - cy * sc * k })
  }

  return (
    <div ref={root} className="story scene">
      <div className="story-fig">
        <div className="w-full">
          <p className="scene-title">{scene.title}</p>
          {interactive && <p className="fig-note">NCut10, декабрь 2024. Проекция X0/X1, не полная геометрия и не карта; показаны пять сильнейших связей каждого МО, включая равные веса.</p>}
          <div className="relative">
            <canvas key={workerFailed ? 'local' : 'worker'} ref={cv} role="img" style={{ aspectRatio: `${W} / ${H}` }} aria-label={`История, шаг ${steps[step].k}`} className={`block w-full ${interactive ? 'cursor-grab touch-pan-y active:cursor-grabbing' : ''}`}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => { hoverPt.current = null; if (S.current.hover != null) { S.current.hover = null; placeHover() } }} />
            <span ref={ringEl} hidden aria-hidden className="scene-ring" />
            <div ref={tipEl} hidden aria-hidden className="scene-tip" />
          </div>
        {interactive && (
            <div className="net-ctl">
              <button type="button" onClick={() => zoomAt(S.current.w / 2, (S.current.w * H) / W / 2, 1 / 1.5)} aria-label="Отдалить">−</button>
              <span ref={zoomEl}>{Math.round(S.current.view.k * 100)}%</span>
              <button type="button" onClick={() => zoomAt(S.current.w / 2, (S.current.w * H) / W / 2, 1.5)} aria-label="Приблизить">+</button>
              <button type="button" onClick={reset}>Весь граф</button>
              {fb && <button type="button" onClick={toPair}>К паре</button>}
              {(scene.color === 'pair' || scene.color === 'focus') && <button type="button" aria-pressed={showGroups} onClick={() => setShowGroups(v => !v)}>{showGroups ? 'Только пара' : 'Показать группы'}</button>}
            </div>
          )}
          {(sk === 'map' || sk === 'mapLinks') && noGeo > 0 && <p className="fig-note">{noGeo} МО без границ в справочнике на карте не показаны</p>}
          {sk === 'mapLinks' && <p className="fig-note">Расстояние известно для {FAR.n.toLocaleString('ru-RU')} из {FAR.totalEdges.toLocaleString('ru-RU')} отображённых связей. Остальные {FAR.unknownCoordinateEdges.toLocaleString('ru-RU')} не входят в расчёт доли дальних связей.</p>}
          <div className="scene-under">{steps[step].cmp ? <div className="scene-cmp" key={step}>{steps[step].cmp}</div> : (sk === 'rows' || sk === 'swarmColor' || sk === 'map' || sk === 'graphGroups') && (
            <ul className="scene-legend">{groups.map(g => <li key={g.g}><i style={{ background: rankColor(cl, g.g) }} />{g.name}: {g.size.toLocaleString('ru-RU')} МО</li>)}</ul>
          )}</div>
        </div>
        <ol className="story-dots" aria-hidden>{steps.map((_, i) => <li key={i} className={i === step ? 'on' : ''} />)}</ol>
      </div>
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
