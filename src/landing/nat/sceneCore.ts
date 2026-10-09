// Отрисовка сцен глав 01–03 без React и без данных сайта: всё нужное приходит одним пакетом (SceneData).
// Модуль работает и в фоновом потоке (OffscreenCanvas в Worker — кадры переходов не занимают основной поток),
// и в основном потоке, если браузер не умеет передавать холст в Worker.

export const W = 1000, H = 640
export const PADX = 60, R = 3.1, MAPY = 20
export type View = { x: number; y: number; k: number }
export type SceneKey = 'swarm' | 'swarmShare' | 'swarmColor' | 'rows' | 'map' | 'mapLinks' | 'mapFocus' | 'graphPair' | 'graphFocus' | 'graphGroups'
export type PosKey = 'one' | 'split' | 'geo' | 'net'
type LayerKey = 'map' | 'axis' | 'rows' | 'geoEdges' | 'netEdges' | 'pair'
export const SCENE: Record<SceneKey, { pos: PosKey; layers: LayerKey[]; color: 'gray' | 'group' | 'pair' | 'share' | 'focus'; title: string }> = {
  swarm: { pos: 'one', layers: ['axis'], color: 'gray', title: 'Модельные средние расходы жителей, все категории · лог. шкала' },
  swarmShare: { pos: 'one', layers: ['axis'], color: 'share', title: 'Те же МО · цвет — доля питания вне дома в тратах, темнее — больше' },
  swarmColor: { pos: 'one', layers: ['axis'], color: 'group', title: 'Те же МО, цвет — группа' },
  rows: { pos: 'split', layers: ['axis', 'rows'], color: 'group', title: 'Группы по рядам' },
  map: { pos: 'geo', layers: ['map'], color: 'group', title: 'Каждое МО на своём месте' },
  mapLinks: { pos: 'geo', layers: ['map', 'geoEdges', 'pair'], color: 'pair', title: 'Связи похожих МО на карте' },
  mapFocus: { pos: 'geo', layers: ['map'], color: 'focus', title: 'Соседи по сети на карте' },
  graphPair: { pos: 'net', layers: ['netEdges', 'pair'], color: 'pair', title: 'Сеть похожих: проекция двух координат, не карта' },
  graphFocus: { pos: 'net', layers: ['netEdges'], color: 'focus', title: 'Сеть похожих · соседи одного МО' },
  graphGroups: { pos: 'net', layers: ['netEdges'], color: 'group', title: 'Сеть похожих: группы' },
}
const LAYER_KEYS: LayerKey[] = ['map', 'axis', 'rows', 'geoEdges', 'netEdges', 'pair']
export const SHARE_COLS = ['#E9ECF2', '#C7CDD9', '#9AA3B6', '#6A7489', '#3B4356', '#111111']

/** Пакет данных сцены: координаты в «мировых» единицах W×H, NaN — нет точки. Индекс — номер территории. */
export interface SceneData {
  n: number
  seen: Int32Array
  /** x по уровню расходов (лог. шкала) — для облака и рядов */
  xv: Float32Array
  /** группа МО (-1 — нет), номер ряда группы (0 — большие расходы) */
  lab: Int16Array
  row: Int8Array
  geo: Float32Array
  net: Float32Array
  /** ступень доли общепита 0–5 */
  shareStep: Uint8Array
  edges: Int32Array
  /** связь длиннее 1000 км; «пачка» — далёкие связи МО одного региона (для пояснения) */
  far: Uint8Array
  bundle: Uint8Array
  colors: Record<number, string>
  short: string[]
  axis: { ticks: { x: number; label: string }[]; title: string; missing: string }
  rows: { y: number; label: string; color: string; xm: number; median: string }[]
  rowYs: number[]
  pair: { s: number; t: number } | null
}

export interface StepMsg { idx: number; scene: SceneKey; highlight: number[] | null; star: number | null; view: 'pair' | 'focus' | 'reset' | 'keep'; animateView: boolean; showGroups: boolean; reduced: boolean }

// ---- раскладки облака: детерминированный beeswarm — x точно по расходам, y — ближайшее свободное место от оси ряда
function beeswarm(d: SceneData, ids: number[], cy: number, half: number, dens: number, out: Float32Array) {
  const D = (2 * R + 0.35) * dens, D2 = D * D
  const order = ids.map(i => ({ i, x: d.xv[i] })).sort((p, q) => p.x - q.x)
  const px: number[] = [], py: number[] = []
  order.forEach((p, n) => {
    let k = px.length - 1
    const near: number[] = []
    for (; k >= 0 && p.x - px[k] < D; k--) near.push(k)
    let y: number | null = null
    for (let step = 0; y == null && step * D * 0.5 <= half; step++) {
      for (const sg of step ? [1, -1] : [1]) { const c = cy + sg * step * D * 0.5; if (near.every(q => (px[q] - p.x) ** 2 + (py[q] - c) ** 2 >= D2)) { y = c; break } }
    }
    // места в полосе не осталось: ставим внутрь полосы с детерминированным сдвигом
    if (y == null) y = cy + (((n * 2654435761) % 1000) / 500 - 1) * half
    px.push(p.x); py.push(y); out[2 * p.i] = p.x; out[2 * p.i + 1] = y
  })
}
export function swarmsOf(d: SceneData) {
  const one = new Float32Array(2 * d.n).fill(NaN), split = new Float32Array(2 * d.n).fill(NaN)
  const seen = [...d.seen]
  beeswarm(d, seen, H / 2 - 40, 230, 1, one)
  const gap = d.rowYs.length > 1 ? Math.min(...d.rowYs.slice(1).map((y, i) => y - d.rowYs[i])) : 230
  d.rowYs.forEach((y, r) => beeswarm(d, seen.filter(i => d.row[i] === r), y, Math.min(84, gap * 0.24), 0.74, split))
  return { one, split }
}

type Canvas = HTMLCanvasElement | OffscreenCanvas
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
const mkCanvas = (w: number, h: number): Canvas => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }))

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

// ---- контуры МО (одни на все карты и сцены): строки приходят один раз, Path2D строятся при первой карте
let PATHS: { paths: string[]; out: string } | null = null
let SHAPES: { all: Path2D[]; out: Path2D } | null = null
export function setMapPaths(paths: string[], out: string) { PATHS = { paths, out }; SHAPES = null }
const mapShapes = () => (SHAPES ??= { all: PATHS!.paths.map(p => new Path2D(p)), out: new Path2D(PATHS!.out) })

/** Карта МО: фон территорий без данных, заливка каждого МО цветом из палитры (255 — не рисовать), белые границы.
 *  scale — пикселей холста на единицу карты, lw — толщина границ в единицах карты. */
export function paintMap(c: Canvas, w: number, h: number, scale: number, lw: number, fills: Uint8Array, palette: string[]) {
  const { all, out } = mapShapes()
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
  const x = c.getContext('2d') as Ctx
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, w, h)
  x.setTransform(scale, 0, 0, scale, 0, 0)
  x.fillStyle = '#E9EBF0'; x.fill(out)
  // одинаковые цвета рисуем подряд: меньше смен стиля
  palette.forEach((col, pi) => { x.fillStyle = col; for (let k = 0; k < all.length; k++) if (fills[k] === pi) x.fill(all[k]) })
  x.lineWidth = lw; x.strokeStyle = '#fff'
  for (let k = 0; k < all.length; k++) if (fills[k] !== 255) x.stroke(all[k])
}

/** Общие для всех сцен ресурсы: растр карты под размер, раскладки облака. */
class Shared {
  bmp: { key: string; cv: Canvas } | null = null
  sw: { one: Float32Array; split: Float32Array } | null = null
  d: SceneData
  constructor(d: SceneData) { this.d = d }
  swarms() { return (this.sw ??= swarmsOf(this.d)) }
  mapBitmap(w: number, h: number, dpr: number) {
    const key = `${w}x${h}@${dpr}`
    if (this.bmp?.key === key) return this.bmp.cv
    const c = this.bmp?.cv ?? mkCanvas(1, 1); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr)
    const x = c.getContext('2d') as Ctx, sc = w / W
    x.setTransform(dpr * sc, 0, 0, dpr * sc, 0, dpr * sc * MAPY)
    const { all, out } = mapShapes()
    x.fillStyle = '#EEF0F4'; x.fill(out)
    x.fillStyle = '#EEF0F4'; x.strokeStyle = '#fff'; x.lineWidth = 0.4 / sc
    for (const p of all) { x.fill(p); x.stroke(p) }
    this.bmp = { key, cv: c }
    return c
  }
}
let SHARED: Shared | null = null
export function setSceneData(d: SceneData) { SHARED = new Shared(d) }
export const sceneSwarms = () => SHARED!.swarms()

/** Одна сцена: состояние перехода, камера, цикл кадров. */
export class SceneRenderer {
  private d: SceneData
  private sh: Shared
  private ctx: Ctx
  private from: Float32Array; private to: Float32Array; private cur: Float32Array
  private netPos: Float32Array
  private t0 = 0; private dur = 0
  private layer: Record<LayerKey, number>; private layerFrom: Record<LayerKey, number>; private layerTo: Record<LayerKey, number>; private lt0 = 0
  private gray = 0; private dim = 0; private share = 0; private mark = 0
  private grayFrom = 0; private grayTo = 0; private dimFrom = 0; private dimTo = 0; private shareFrom = 0; private shareTo = 0; private markFrom = 0; private markTo = 0; private ct0 = 0
  private view: View = { x: 0, y: 0, k: 1 }
  private vt: { from: View; to: View; t0: number; dur: number } | null = null
  private size = { w: 0, h: 0, dpr: 1 }
  private step: StepMsg
  private scene: SceneKey
  private vis = false
  private raf = 0
  private lo = false
  private touched = false
  private edgeCache: { key: string; cv: Canvas } | null = null
  private edgeKeyT = 0
  private netVer = 0
  private later = 0
  private stepVer = 0
  private hover: number | null = null
  private cv: Canvas
  private onView: (v: View) => void
  constructor(cv: Canvas, first: SceneKey, onView: (v: View) => void) {
    this.cv = cv; this.onView = onView
    this.sh = SHARED!; this.d = this.sh.d
    this.ctx = cv.getContext('2d') as Ctx
    const n2 = 2 * this.d.n
    this.netPos = this.d.net.slice()
    this.to = this.posOf(SCENE[first].pos).slice(); this.from = this.to.slice(); this.cur = new Float32Array(n2).fill(NaN)
    const L = SCENE[first]
    this.layer = Object.fromEntries(LAYER_KEYS.map(k => [k, L.layers.includes(k) ? 1 : 0])) as Record<LayerKey, number>
    this.layerFrom = { ...this.layer }; this.layerTo = { ...this.layer }
    this.gray = this.grayTo = L.color === 'gray' ? 1 : 0
    this.share = this.shareTo = L.color === 'share' ? 1 : 0
    this.dim = this.dimTo = L.color === 'pair' || L.color === 'focus' ? 1 : 0
    this.scene = first
    this.step = { idx: -1, scene: first, highlight: null, star: null, view: 'keep', animateView: false, showGroups: false, reduced: false }
  }
  private posOf(p: PosKey) {
    if (p === 'net') return this.netPos
    if (p === 'geo') return this.d.geo
    const sw = this.sh.sw
    return sw ? sw[p] : new Float32Array(2 * this.d.n).fill(NaN)
  }
  /** раскладки облака готовы: точки облака встают на места без анимации */
  swarmsReady() {
    const p = SCENE[this.scene].pos
    if (p === 'one' || p === 'split') { this.to = this.posOf(p).slice(); this.from = this.to.slice(); this.dur = 0 }
    this.kick()
  }
  setVisible(on: boolean) {
    this.vis = on
    if (on) this.kick()
    else { cancelAnimationFrame(this.raf); this.cv.width = 0; this.cv.height = 0; this.edgeCache = null }
  }
  resize(w: number, dpr: number) {
    const was = this.size.w
    this.size = { w, h: w * (H / W), dpr }
    if (!this.touched && w !== was) {
      if (this.scene === 'graphPair') this.setView(this.pairView(), false)
      else if (this.scene === 'graphFocus' && this.step.view === 'focus') this.setView(this.focusView(), false)
    }
    this.kick()
  }
  touch() { this.touched = true; this.vt = null }
  setStep(m: StepMsg) {
    const now = performance.now(), L = SCENE[m.scene], prevShow = this.step.showGroups
    const sceneChanged = m.idx !== this.step.idx
    this.step = m; this.scene = m.scene
    if (sceneChanged) {
      this.stepVer++
      if (L.pos !== 'net') { this.netPos = this.d.net.slice(); this.netVer++ }
      this.from = this.hasCur() ? this.cur.slice() : this.to.slice()
      this.to = this.posOf(L.pos).slice()
      this.t0 = now; this.dur = m.reduced ? 0 : 250
      this.layerFrom = { ...this.layer }
      this.layerTo = Object.fromEntries(LAYER_KEYS.map(k => [k, L.layers.includes(k) ? 1 : 0])) as Record<LayerKey, number>
      this.lt0 = now
      this.touched = false
      if (m.view === 'pair' && this.size.w) this.setView(this.pairView(), m.animateView, m.reduced)
      else if (m.view === 'focus' && this.size.w) this.setView(this.focusView(), m.animateView, m.reduced)
      else if (m.view === 'reset') this.setView({ x: 0, y: 0, k: 1 }, m.animateView && this.view.k !== 1, m.reduced)
    }
    if (sceneChanged || prevShow !== m.showGroups) {
      this.grayFrom = this.gray; this.grayTo = L.color === 'gray' ? 1 : 0
      this.dimFrom = this.dim; this.dimTo = (L.color === 'pair' && !m.showGroups && this.d.pair) || (L.color === 'focus' && !m.showGroups) ? 1 : 0
      this.shareFrom = this.share; this.shareTo = L.color === 'share' ? 1 : 0
      this.markFrom = this.mark; this.markTo = m.highlight ? 1 : 0
      this.ct0 = now
    }
    if (!m.reduced) this.lo = true
    this.kick()
  }
  private hasCur() { for (const i of this.d.seen) if (!Number.isNaN(this.cur[2 * i])) return true; return false }
  /** камера: сразу или коротким переходом (250 мс) */
  setView(to: View, animate: boolean, reduced = false) {
    this.onView(to)
    if (!animate || reduced) { this.vt = null; this.view = to; this.kick(); return }
    this.vt = { from: { ...this.view }, to, t0: performance.now(), dur: 250 }
    this.kick()
  }
  pairView(): View {
    const p = this.d.pair, sc = this.size.w / W
    if (!p) return { x: 0, y: 0, k: 1 }
    const a = this.netPos, cx = (a[2 * p.s] + a[2 * p.t]) / 2, cy = (a[2 * p.s + 1] + a[2 * p.t + 1]) / 2, k = 4
    return { k, x: this.size.w / 2 - cx * sc * k, y: this.size.h / 2 - cy * sc * k }
  }
  private focusView(): View {
    const sc = this.size.w / W, ids = [...(this.step.highlight ?? []), ...(this.step.star != null ? [this.step.star] : [])]
    const xs: number[] = [], ys: number[] = []
    for (const i of ids) { const x = this.netPos[2 * i]; if (!Number.isNaN(x)) { xs.push(x); ys.push(this.netPos[2 * i + 1]) } }
    if (!xs.length) return { x: 0, y: 0, k: 1 }
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const span = Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) * (W / H), 60)
    const k = Math.min(6, Math.max(1, (W * 0.7) / span))
    return { k, x: this.size.w / 2 - cx * sc * k, y: this.size.h / 2 - cy * sc * k }
  }
  /** точку графа перетащили (мировые координаты) */
  moveNode(i: number, x: number, y: number) {
    this.netPos[2 * i] = x; this.netPos[2 * i + 1] = y
    if (SCENE[this.scene].pos === 'net') { this.to[2 * i] = x; this.to[2 * i + 1] = y; this.from[2 * i] = x; this.from[2 * i + 1] = y }
    this.netVer++; this.kick()
  }
  resetNet(reduced: boolean) {
    this.netVer++; this.netPos = this.d.net.slice()
    this.from = this.cur.slice(); this.to = this.netPos.slice(); this.t0 = performance.now(); this.dur = reduced ? 0 : 250
    this.lo = !reduced
    this.setView({ x: 0, y: 0, k: 1 }, false)
  }

  private kick() {
    cancelAnimationFrame(this.raf)
    if (!this.vis) return
    // движется — следующий кадр; остановилась после кадров пониженной плотности — ещё один чёткий кадр
    const loop = () => { if (this.draw()) this.raf = requestAnimationFrame(loop); else if (this.lo) { this.lo = false; this.raf = requestAnimationFrame(loop) } }
    this.raf = requestAnimationFrame(loop)
  }
  private kickLater() { clearTimeout(this.later); this.later = setTimeout(() => this.kick(), 300) as unknown as number }

  /** Кадр. Возвращает true, если сцена ещё движется. */
  private draw() {
    const { d, size } = this
    if (!size.w) return false
    // пока сцена движется, кадры — в холст пониженной плотности (~1 пиксель на CSS-пиксель): передача кадра
    // композитору пропорциональна площади; последний кадр после остановки — в полной чёткости
    const w = size.w, h = size.h
    const budget = this.lo ? 0.3e6 : 0.8e6
    const dpr = Math.max(1, Math.min(2, size.dpr, Math.sqrt(budget / Math.max(1, w * h))))
    const W2 = Math.round(w * dpr), H2 = Math.round(h * dpr)
    if (this.cv.width !== W2 || this.cv.height !== H2) { this.cv.width = W2; this.cv.height = H2 }
    const ctx = this.ctx
    const now = performance.now(), sc = w / W
    let busy = false, moving = false
    const { from, to, cur } = this
    for (const i of d.seen) {
      const bx = to[2 * i], by = to[2 * i + 1]
      if (Number.isNaN(bx)) { cur[2 * i] = NaN; continue }
      const ax = from[2 * i], ay = from[2 * i + 1]
      if (Number.isNaN(ax) || !this.dur) { cur[2 * i] = bx; cur[2 * i + 1] = by; continue }
      const k = clamp01((now - this.t0) / this.dur)
      if (k < 1) { busy = true; moving = true }
      const e = ease(k); cur[2 * i] = ax + (bx - ax) * e; cur[2 * i + 1] = ay + (by - ay) * e
    }
    const lk = clamp01((now - this.lt0) / 250)
    if (lk < 1) busy = true
    for (const key of LAYER_KEYS) {
      const late = (key === 'geoEdges' || key === 'netEdges' || key === 'pair') && (this.layerTo[key] ?? 0) > (this.layerFrom[key] ?? 0)
      const kk = late ? (now - this.lt0 >= 250 ? 1 : 0) : lk
      if (late && kk < 1) busy = true
      this.layer[key] = (this.layerFrom[key] ?? 0) + ((this.layerTo[key] ?? 0) - (this.layerFrom[key] ?? 0)) * kk
    }
    const ck = clamp01((now - this.ct0) / 250); if (ck < 1) busy = true
    this.gray = this.grayFrom + (this.grayTo - this.grayFrom) * ck
    this.dim = this.dimFrom + (this.dimTo - this.dimFrom) * ck
    this.share = this.shareFrom + (this.shareTo - this.shareFrom) * ck
    const mk = clamp01((now - this.ct0) / 250); if (mk < 1) busy = true
    this.mark = this.markFrom + (this.markTo - this.markFrom) * (this.markTo > this.markFrom ? mk : ck)
    // камера
    if (this.vt) {
      const t = (now - this.vt.t0) / this.vt.dur
      if (t >= 1) { this.view = this.vt.to; this.vt = null }
      else { busy = true; if (t > 0) { const e = ease(t), a = this.vt.from, b = this.vt.to; this.view = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, k: a.k + (b.k - a.k) * e } } }
    }

    const v = this.view, L = this.layer
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h)
    ctx.setTransform(dpr * sc * v.k, 0, 0, dpr * sc * v.k, dpr * v.x, dpr * v.y)
    const px = 1 / (sc * v.k)
    if (L.map > 0.01) {
      // карта нужна только без приближения: накладываем готовую картинку
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = L.map
      ctx.drawImage(this.sh.mapBitmap(w, h, dpr), dpr * v.x, dpr * v.y, w * dpr * v.k, h * dpr * v.k)
      ctx.restore()
    }
    if (L.axis > 0.01) {
      const ay = H - 70
      ctx.save(); ctx.globalAlpha = L.axis
      ctx.strokeStyle = 'rgba(17,17,17,.25)'; ctx.lineWidth = px; ctx.beginPath(); ctx.moveTo(PADX, ay); ctx.lineTo(W - PADX, ay); ctx.stroke()
      ctx.fillStyle = '#555A66'; ctx.font = '13px "JetBrains Mono Variable", monospace'; ctx.textAlign = 'center'
      for (const t of d.axis.ticks) { ctx.beginPath(); ctx.moveTo(t.x, ay); ctx.lineTo(t.x, ay + 6); ctx.stroke(); ctx.fillText(t.label, t.x, ay + 24) }
      ctx.textAlign = 'right'; ctx.fillText(d.axis.title, W - PADX, ay - 12)
      if (d.axis.missing) { ctx.textAlign = 'left'; ctx.fillText(d.axis.missing, PADX, H - 18) }
      ctx.restore()
    }
    if (L.rows > 0.01) {
      ctx.save(); ctx.globalAlpha = L.rows; ctx.textAlign = 'left'
      const rowGap = d.rowYs.length > 1 ? Math.min(...d.rowYs.slice(1).map((y, i) => y - d.rowYs[i])) : 230
      const rowHalf = Math.min(80, rowGap * 0.24)
      for (const g of d.rows) {
        ctx.fillStyle = g.color; ctx.font = '700 18px "Golos Text Variable", Arial, sans-serif'; ctx.fillText(g.label, PADX, g.y - rowHalf - 9)
        ctx.strokeStyle = '#111'; ctx.lineWidth = 2 * px; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(g.xm, g.y - rowHalf); ctx.lineTo(g.xm, g.y + rowHalf); ctx.stroke(); ctx.setLineDash([])
        ctx.fillStyle = '#111'; ctx.font = '14px "JetBrains Mono Variable", monospace'; ctx.fillText(g.median, g.xm + 8, g.y - rowHalf - 9)
      }
      ctx.restore()
    }
    // связи — дуги (изгиб пропорционален длине), тонкие и полупрозрачные; выделяются только связи одного МО или «пачка» далёких
    const edgeScene = L.geoEdges > 0.01 || L.netEdges > 0.01
    const scol = SCENE[this.scene].color
    const isGeo = SCENE[this.scene].pos === 'geo'
    // фокус: МО под курсором; в сети — первое МО пары; в сценах «соседи одного МО» — центр
    const fm = this.hover != null && edgeScene ? this.hover : scol === 'pair' && d.pair && !isGeo ? d.pair.s : scol === 'focus' && this.step.star != null ? this.step.star : null
    const curve = (x: Ctx, k: number) => {
      const a = 2 * d.edges[2 * k], b = 2 * d.edges[2 * k + 1], ax = cur[a], bx = cur[b]
      if (Number.isNaN(ax) || Number.isNaN(bx)) return
      const ay = cur[a + 1], by = cur[b + 1], dx = bx - ax, dy = by - ay
      x.moveTo(ax, ay); x.quadraticCurveTo((ax + bx) / 2 - dy * 0.16, (ay + by) / 2 + dx * 0.16, bx, by)
    }
    const nE = d.edges.length / 2
    const strokeSet = (x: Ctx, pred: (k: number) => boolean, style: string, lw: number) => { x.strokeStyle = style; x.lineWidth = lw * px; x.beginPath(); for (let k = 0; k < nE; k++) if (pred(k)) curve(x, k); x.stroke() }
    // фоновый слой связей (в растр): при фокусе — почти прозрачный; на карте далёкие связи приглушены
    const baseLayer = (x: Ctx) => {
      if (fm != null) { strokeSet(x, () => true, 'rgba(17,17,17,.025)', 0.5); return }
      if (isGeo) { strokeSet(x, k => !d.far[k], 'rgba(17,17,17,.07)', 0.55); strokeSet(x, k => d.far[k] === 1, 'rgba(17,17,17,.025)', 0.5); return }
      strokeSet(x, () => true, 'rgba(17,17,17,.07)', 0.5)
    }
    const edges = (alpha: number) => {
      if (alpha < 0.01 || moving) return
      const key = `${this.cv.width}x${this.cv.height}|${v.x.toFixed(1)},${v.y.toFixed(1)},${v.k.toFixed(4)}|${fm != null ? 1 : 0}|${isGeo ? 1 : 0}|${this.stepVer}|${this.netVer}`
      const now2 = performance.now()
      if (this.edgeCache?.key !== key && now2 - this.edgeKeyT < 250) {
        // вид меняется каждый кадр (камера едет, точку тянут): растр бесполезен, рисуем связи напрямую
        this.edgeKeyT = now2
        ctx.save(); ctx.globalAlpha = alpha; baseLayer(ctx); ctx.restore()
        if (!busy) this.kickLater()
      } else {
        if (this.edgeCache?.key !== key) {
          this.edgeKeyT = now2
          const c = this.edgeCache?.cv ?? mkCanvas(1, 1)
          c.width = this.cv.width; c.height = this.cv.height
          const x = c.getContext('2d') as Ctx
          x.setTransform(dpr * sc * v.k, 0, 0, dpr * sc * v.k, dpr * v.x, dpr * v.y)
          baseLayer(x)
          this.edgeCache = { key, cv: c }
        }
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.drawImage(this.edgeCache.cv, 0, 0); ctx.restore()
      }
      // верхний слой: связи выбранного МО — ярко; без фокуса на карте — одна пачка далёких связей
      ctx.save(); ctx.globalAlpha = alpha
      if (fm != null) strokeSet(ctx, k => d.edges[2 * k] === fm || d.edges[2 * k + 1] === fm, 'rgba(17,17,17,.85)', 1.2)
      else if (isGeo) strokeSet(ctx, k => d.bundle[k] === 1, 'rgba(17,17,17,.2)', 0.6)
      ctx.restore()
    }
    edges(Math.max(L.geoEdges, L.netEdges))
    // точки: группы, серый фон (всё серое либо всё кроме пары); пока сцена движется — квадратики (дешевле кругов)
    const r = R / Math.sqrt(v.k), mute = '#C3C8D2', st = this.step
    const focus = new Set(st.highlight ?? (d.pair ? [d.pair.s, d.pair.t] : []))
    if (st.star != null) focus.add(st.star)
    const hoverDim = this.hover != null && edgeScene
    if (hoverDim) { focus.clear(); focus.add(this.hover!); for (let k = 0; k < nE; k++) { const a0 = d.edges[2 * k], b0 = d.edges[2 * k + 1]; if (a0 === this.hover) focus.add(b0); else if (b0 === this.hover) focus.add(a0) } }
    const buckets = new Map<string, number[]>()
    for (const i of d.seen) {
      if (Number.isNaN(cur[2 * i])) continue
      let key: string
      if (this.share > 0.5) key = `${SHARE_COLS[d.shareStep[i]]}|1`
      else if (this.gray > 0.5 || ((this.dim > 0.5 || hoverDim) && !focus.has(i))) key = `${mute}|${this.gray > 0.5 ? 0.9 : 0.55}`
      else key = `${d.colors[d.lab[i]]}|1`
      let b = buckets.get(key); if (!b) buckets.set(key, (b = [])); b.push(i)
    }
    const square = moving
    buckets.forEach((ids, key) => {
      const [c, a] = key.split('|'); ctx.globalAlpha = Number(a); ctx.fillStyle = c; ctx.beginPath()
      if (square) { const s = r * 1.8; for (const i of ids) ctx.rect(cur[2 * i] - s / 2, cur[2 * i + 1] - s / 2, s, s) }
      else for (const i of ids) { const x = cur[2 * i], y = cur[2 * i + 1]; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2) }
      ctx.fill()
      // узлы поверх связей с белой обводкой (в сценах со связями)
      if (!square && edgeScene) { ctx.lineWidth = 0.7 * px; ctx.strokeStyle = '#fff'; ctx.stroke() }
    })
    ctx.globalAlpha = 1
    // звезда: линии от МО-героя к соседям; кольца и подписи у подсвеченных МО
    if (st.highlight && this.mark > 0.01) {
      ctx.save(); ctx.globalAlpha = this.mark
      const s0 = st.star
      // линии к соседям рисует слой связей выбранного МО (дуги)
      ctx.font = `700 ${12.5 * px}px "Golos Text Variable", Arial, sans-serif`; ctx.textBaseline = 'middle'
      const placed: { x: number; y: number }[] = []
      for (const i of [...st.highlight, ...(s0 != null ? [s0] : [])]) {
        const qx = cur[2 * i], qy = cur[2 * i + 1]; if (Number.isNaN(qx)) continue
        const big = i === s0
        ctx.beginPath(); ctx.arc(qx, qy, (big ? 9 : 6) * px, 0, Math.PI * 2); ctx.fillStyle = big ? '#FFE14D' : '#fff'; ctx.fill(); ctx.lineWidth = 2 * px; ctx.strokeStyle = '#111'; ctx.stroke()
        // подпись: справа или слева, сдвигаем вниз, если близко к уже поставленной
        let ly = qy; for (const pp of placed) if (Math.abs(pp.x - qx) < 120 * px && Math.abs(pp.y - ly) < 15 * px) ly = pp.y + 15 * px
        placed.push({ x: qx, y: ly })
        const right = qx > W * 0.7, tx = qx + (right ? -12 : 12) * px
        ctx.textAlign = right ? 'right' : 'left'; ctx.lineWidth = 3.5 * px; ctx.strokeStyle = '#fff'
        const text = d.short[i]; ctx.strokeText(text, tx, ly); ctx.fillStyle = '#111'; ctx.fillText(text, tx, ly)
      }
      ctx.textBaseline = 'alphabetic'; ctx.restore()
    }
    ctx.globalAlpha = 1
    const fb = d.pair
    if (fb && L.pair > 0.01 && !Number.isNaN(cur[2 * fb.s]) && !Number.isNaN(cur[2 * fb.t])) {
      const a = { x: cur[2 * fb.s], y: cur[2 * fb.s + 1] }, b = { x: cur[2 * fb.t], y: cur[2 * fb.t + 1] }
      ctx.save(); ctx.globalAlpha = L.pair
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2 - (b.y - a.y) * 0.16, (a.y + b.y) / 2 + (b.x - a.x) * 0.16, b.x, b.y); ctx.stroke()
      for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p.x, p.y, 8.4 * px, 0, Math.PI * 2); ctx.fillStyle = '#FFE14D'; ctx.fill(); ctx.lineWidth = 2.5 * px; ctx.stroke() }
      ctx.font = `800 ${17 * px}px "Fira Sans Extra Condensed", "Arial Narrow", sans-serif`; ctx.lineWidth = 4 * px; ctx.strokeStyle = '#fff'; ctx.fillStyle = '#111'
      const isNet = SCENE[this.scene].pos === 'net'
      ;([[fb.s, a, 0], [fb.t, b, 1]] as const).forEach(([i, q, k]) => {
        const right = q.x > W * 0.6, dy = (isNet && k === 1 ? 26 : -12) * px
        ctx.textAlign = right ? 'right' : 'left'
        const tx = q.x + (right ? -12 : 12) * px, text = d.short[i].toUpperCase()
        ctx.strokeText(text, tx, q.y + dy); ctx.fillText(text, tx, q.y + dy)
      })
      ctx.restore()
    }
    return busy
  }
  /** МО под курсором (в сценах со связями — выделить его связи) */
  setHover(i: number | null) { if (i === this.hover) return; this.hover = i; this.kick() }
  /** шрифты догрузились — перерисовать подписи */
  redraw() { this.edgeCache = null; this.kick() }
}

/** Сеть одного варианта (превью в «Правилах связей»): связи одним контуром, связи активной группы темнее,
 *  точки по цвету группы, кольцо у выбранного МО. Координаты — CSS-пиксели холста. */
export interface NetPaint { w: number; h: number; dpr: number; pos: Float32Array; edges: Int32Array; fills: Uint8Array; palette: string[]; group: Int16Array; active: number; r: number; ring: number }
export function paintNet(c: Canvas, o: NetPaint) {
  const W2 = Math.round(o.w * o.dpr), H2 = Math.round(o.h * o.dpr)
  if (c.width !== W2 || c.height !== H2) { c.width = W2; c.height = H2 }
  const x = c.getContext('2d') as Ctx, p = o.pos, e = o.edges
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W2, H2)
  x.setTransform(o.dpr, 0, 0, o.dpr, 0, 0)
  // рёбра — дуги, тонкие и прозрачные; выделяются только рёбра активной группы
  const line = (only: boolean) => {
    x.beginPath()
    for (let k = 0; k < e.length; k += 2) {
      const a = e[k], b = e[k + 1], ax = p[2 * a], bx = p[2 * b]
      if (Number.isNaN(ax) || Number.isNaN(bx)) continue
      if (only && !(o.group[a] === o.active && o.group[b] === o.active)) continue
      const ay = p[2 * a + 1], by = p[2 * b + 1]
      x.moveTo(ax, ay); x.quadraticCurveTo((ax + bx) / 2 - (by - ay) * 0.16, (ay + by) / 2 + (bx - ax) * 0.16, bx, by)
    }
  }
  line(false); x.strokeStyle = o.active >= 0 ? 'rgba(17,17,17,.03)' : 'rgba(17,17,17,.07)'; x.lineWidth = 0.5; x.stroke()
  if (o.active >= 0) { line(true); x.strokeStyle = 'rgba(17,17,17,.22)'; x.lineWidth = 0.7; x.stroke() }
  // узлы поверх рёбер с белой обводкой
  o.palette.forEach((col, pi) => {
    x.fillStyle = col; x.beginPath()
    for (let i = 0; i < o.fills.length; i++) { if (o.fills[i] !== pi) continue; const px = p[2 * i]; if (Number.isNaN(px)) continue; const py = p[2 * i + 1]; x.moveTo(px + o.r, py); x.arc(px, py, o.r, 0, Math.PI * 2) }
    x.fill(); x.lineWidth = 0.6; x.strokeStyle = '#fff'; x.stroke()
  })
  if (o.ring >= 0 && !Number.isNaN(p[2 * o.ring])) { x.beginPath(); x.arc(p[2 * o.ring], p[2 * o.ring + 1], o.r * 2.2, 0, Math.PI * 2); x.lineWidth = 2; x.strokeStyle = '#111'; x.stroke() }
}
