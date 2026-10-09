// Один фоновый поток для сцен и растеризации. При отказе — тот же код рисования локально.
import { useSyncExternalStore } from 'react'
import { MAP } from './natdata'
import { setMapPaths } from './sceneCore'
import type { FromWorker, ToWorker } from './sceneWorker'

export const canWorker = () => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof ImageBitmap !== 'undefined'
  && 'transferControlToOffscreen' in HTMLCanvasElement.prototype
let w: Worker | null | undefined
const subs = new Set<(m: FromWorker) => void>()
const failureListeners = new Set<() => void>()
let workerFailed = false
let localPaths = false
let nextRequest = 0
const pending = new Map<number, (bitmap: ImageBitmap) => void>()

/** Отказ окончателен до перезагрузки страницы: не повторяем неудачное создание потока. */
export function failCanvasWorker(): void {
  if (workerFailed) return
  workerFailed = true
  const broken = w
  w = null
  if (broken) {
    broken.onmessage = null
    broken.onerror = null
    broken.onmessageerror = null
    broken.terminate()
  }
  pending.clear()
  subs.clear()
  failureListeners.forEach(listener => listener())
}

function subscribeFailure(listener: () => void) {
  failureListeners.add(listener)
  return () => { failureListeners.delete(listener) }
}

/** Смена снимка заставляет потребителей заменить canvas и перейти на локальную отрисовку. */
export function useWorkerFailed(): boolean {
  return useSyncExternalStore(subscribeFailure, () => workerFailed, () => false)
}

/** Поток (создаётся при первом обращении) или null, если браузер не умеет OffscreenCanvas. */
export function canvasWorker(): Worker | null {
  if (w === undefined) {
    if (!canWorker()) w = null
    else {
      try {
        w = new Worker(new URL('./sceneWorker.ts', import.meta.url), { type: 'module' })
        w.onerror = () => failCanvasWorker()
        w.onmessageerror = () => failCanvasWorker()
        w.onmessage = (event: MessageEvent<FromWorker>) => {
          const message = event.data
          if (message.type === 'map') {
            const callback = pending.get(message.req)
            pending.delete(message.req)
            if (callback) callback(message.bmp)
            else message.bmp.close()
          } else subs.forEach(listener => listener(message))
        }
        w.postMessage({ type: 'paths', paths: Object.values(MAP.paths), out: MAP.out } satisfies ToWorker)
      } catch {
        failCanvasWorker()
      }
    }
  }
  return w ?? null
}
export function onWorker(f: (m: FromWorker) => void) { subs.add(f); return () => { subs.delete(f) } }
export function toWorker(message: ToWorker, transfer: Transferable[] = []): boolean {
  const worker = canvasWorker()
  if (!worker) return false
  try {
    worker.postMessage(message, transfer)
    return true
  } catch {
    failCanvasWorker()
    return false
  }
}
/** Запасной путь (без потока): контуры для отрисовки в основном потоке. */
export function ensureLocalPaths() { if (!localPaths) { localPaths = true; setMapPaths(Object.values(MAP.paths), MAP.out) } }

type BitmapRequest = Omit<Extract<ToWorker, { type: 'map' }>, 'req'> | Omit<Extract<ToWorker, { type: 'net' }>, 'req'>
export function requestBitmap(message: BitmapRequest, callback: (bitmap: ImageBitmap) => void, transfer: Transferable[] = []): number {
  const request = ++nextRequest
  pending.set(request, callback)
  if (!toWorker({ ...message, req: request } as ToWorker, transfer)) pending.delete(request)
  return request
}

export function cancelBitmap(request: number): void {
  pending.delete(request)
}

export function showBitmap(canvas: HTMLCanvasElement, bitmap: ImageBitmap): void {
  try {
    const context = canvas.getContext('bitmaprenderer')
    if (!context) throw new Error('ImageBitmapRenderingContext unavailable')
    context.transferFromImageBitmap(bitmap)
  } catch {
    bitmap.close()
    failCanvasWorker()
  }
}
