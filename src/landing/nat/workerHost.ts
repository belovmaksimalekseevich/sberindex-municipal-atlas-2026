// Один фоновый поток на всю страницу для холстов: сцены глав 01–03 и растеризация карт МО.
import { MAP } from './natdata'
import { setMapPaths } from './sceneCore'
import type { FromWorker, ToWorker } from './sceneWorker'

export const canWorker = () => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof ImageBitmap !== 'undefined'
  && 'transferControlToOffscreen' in HTMLCanvasElement.prototype
let w: Worker | null | undefined
const subs = new Set<(m: FromWorker) => void>()
let localPaths = false

/** Поток (создаётся при первом обращении) или null, если браузер не умеет OffscreenCanvas. */
export function canvasWorker(): Worker | null {
  if (w === undefined) {
    if (!canWorker()) w = null
    else {
      w = new Worker(new URL('./sceneWorker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<FromWorker>) => subs.forEach(f => f(e.data))
      w.postMessage({ type: 'paths', paths: Object.values(MAP.paths), out: MAP.out } satisfies ToWorker)
    }
  }
  return w
}
export function onWorker(f: (m: FromWorker) => void) { subs.add(f); return () => { subs.delete(f) } }
export const toWorker = (m: ToWorker, t: Transferable[] = []) => canvasWorker()!.postMessage(m, t)
/** Запасной путь (без потока): контуры для отрисовки в основном потоке. */
export function ensureLocalPaths() { if (!localPaths) { localPaths = true; setMapPaths(Object.values(MAP.paths), MAP.out) } }

// ---- запросы картинок (карты, сети): ответ — ImageBitmap; устаревшие ответы выбрасываются
let REQ = 0
const pending = new Map<number, (b: ImageBitmap) => void>()
let listening = false
/** Отправить запрос на картинку; cb получит ImageBitmap. Возвращает номер запроса. */
export function requestBitmap(m: Extract<ToWorker, { type: 'map' } | { type: 'net' }>['type'] extends string ? Omit<Extract<ToWorker, { type: 'map' }>, 'req'> | Omit<Extract<ToWorker, { type: 'net' }>, 'req'> : never, cb: (b: ImageBitmap) => void, t: Transferable[] = []) {
  if (!listening) { listening = true; onWorker(r => { if (r.type === 'map') { const f = pending.get(r.req); pending.delete(r.req); if (f) f(r.bmp); else r.bmp.close() } }) }
  const req = ++REQ
  pending.set(req, cb)
  toWorker({ ...m, req } as ToWorker, t)
  return req
}
/** Показать картинку на холсте «bitmaprenderer» (без копирования). */
export const showBitmap = (cv: HTMLCanvasElement, b: ImageBitmap) => (cv.getContext('bitmaprenderer') as ImageBitmapRenderingContext).transferFromImageBitmap(b)
