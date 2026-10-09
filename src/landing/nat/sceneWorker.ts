// Фоновый поток сцен глав 01–03: холсты переданы сюда (OffscreenCanvas), кадры переходов рисуются вне основного потока.
import { SceneRenderer, paintMap, paintNet, type NetPaint, sceneSwarms, setMapPaths, setSceneData, type SceneData, type SceneKey, type StepMsg, type View } from './sceneCore'

export type ToWorker =
  | { type: 'paths'; paths: string[]; out: string }
  | { type: 'net'; req: number; o: NetPaint }
  | { type: 'map'; req: number; w: number; h: number; scale: number; lw: number; fills: Uint8Array; palette: string[] }
  | { type: 'data'; data: SceneData; fonts: { family: string; url: string; range: string; weight: string }[] }
  | { type: 'init'; id: number; canvas: OffscreenCanvas; first: SceneKey }
  | { type: 'size'; id: number; w: number; dpr: number }
  | { type: 'vis'; id: number; on: boolean }
  | { type: 'step'; id: number; step: StepMsg }
  | { type: 'view'; id: number; view: View; animate: boolean }
  | { type: 'touch'; id: number }
  | { type: 'hover'; id: number; i: number | null }
  | { type: 'node'; id: number; i: number; x: number; y: number }
  | { type: 'reset'; id: number; reduced: boolean }
  | { type: 'drop'; id: number }
export type FromWorker = { type: 'map'; req: number; bmp: ImageBitmap } | { type: 'swarms'; one: Float32Array; split: Float32Array } | { type: 'view'; id: number; view: View }

const scenes = new Map<number, SceneRenderer>()
const post = (m: FromWorker, t: Transferable[] = []) => (self as unknown as Worker).postMessage(m, t)

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data
  if (m.type === 'paths') { setMapPaths(m.paths, m.out); return }
  if (m.type === 'map') {
    // карта МО: растеризуется здесь и уходит готовой картинкой (ImageBitmap) без копирования
    const c = new OffscreenCanvas(m.w, m.h)
    paintMap(c, m.w, m.h, m.scale, m.lw, m.fills, m.palette)
    const bmp = c.transferToImageBitmap()
    post({ type: 'map', req: m.req, bmp }, [bmp])
    return
  }
  if (m.type === 'net') {
    const c = new OffscreenCanvas(1, 1)
    paintNet(c, m.o)
    const bmp = c.transferToImageBitmap()
    post({ type: 'map', req: m.req, bmp }, [bmp])
    return
  }
  if (m.type === 'data') {
    setSceneData(m.data)
    // раскладки облака считаются здесь же, в фоне; основной поток получает копию для подсказок под курсором
    setTimeout(() => {
      const sw = sceneSwarms()
      scenes.forEach(s => s.swarmsReady())
      post({ type: 'swarms', one: sw.one.slice(), split: sw.split.slice() })
    }, 0)
    // шрифты подписей: в потоке свой набор шрифтов
    const fs = (self as unknown as { fonts?: FontFaceSet }).fonts
    if (fs && typeof FontFace !== 'undefined') {
      Promise.all(m.fonts.map(f => { const ff = new FontFace(f.family, `url(${f.url})`, { unicodeRange: f.range, weight: f.weight }); fs.add(ff); return ff.load().catch(() => null) }))
        .then(() => scenes.forEach(s => s.redraw()))
    }
    return
  }
  if (m.type === 'init') { scenes.set(m.id, new SceneRenderer(m.canvas, m.first, view => post({ type: 'view', id: m.id, view }))); return }
  const s = scenes.get(m.id)
  if (!s) return
  switch (m.type) {
    case 'size': s.resize(m.w, m.dpr); break
    case 'vis': s.setVisible(m.on); break
    case 'step': s.setStep(m.step); break
    case 'view': s.setView(m.view, m.animate); break
    case 'touch': s.touch(); break
    case 'hover': s.setHover(m.i); break
    case 'node': s.moveNode(m.i, m.x, m.y); break
    case 'reset': s.resetNet(m.reduced); break
    case 'drop': s.setVisible(false); scenes.delete(m.id); break
  }
}
