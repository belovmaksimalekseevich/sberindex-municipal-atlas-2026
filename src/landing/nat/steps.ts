import type { RefObject } from 'react'
import { ScrollTrigger, useGSAP } from '../motion'

/** Переход по меню идёт через goTo: пока страница едет, шаги глав по пути не переключаются
 *  (иначе их анимации наслаиваются); по окончании каждая глава выставляет итоговый шаг сразу. */
export const nav = { busy: false }
export const NAV_END = 'goto:end'
/** Страница построена целиком (всё ниже первого экрана монтируется после первой отрисовки). */
export const page = { full: false }
export const FULL_EVENT = 'landing:full'
/** Выполнить, когда страница построена целиком. */
export function whenFull(f: () => void) {
  if (page.full) { f(); return () => {} }
  const on = () => f()
  addEventListener(FULL_EVENT, on, { once: true })
  return () => removeEventListener(FULL_EVENT, on)
}

/** Шаги рассказа: активен шаг, пересекающий линию на 60% высоты окна (на узком экране — на 80%: картинка занимает верх окна). */
const LINE = () => (innerWidth < 861 ? 0.8 : 0.5)
export function useSteps(root: RefObject<HTMLElement | null>, setStep: (i: number) => void) {
  useGSAP(() => {
    const els = [...root.current!.querySelectorAll<HTMLElement>('[data-step]')]
    els.forEach(el => {
      const i = Number(el.dataset.step)
      const pc = Math.round(LINE() * 100)
      ScrollTrigger.create({ trigger: el, start: `top ${pc}%`, end: `bottom ${pc}%`, onToggle: s => { if (s.isActive && !nav.busy) setStep(i) } })
    })
    const settle = () => {
      const line = innerHeight * LINE()
      let cur = -1
      els.forEach((el, k) => { if (el.getBoundingClientRect().top <= line) cur = k })
      if (cur >= 0) setStep(Number(els[cur].dataset.step))
    }
    addEventListener(NAV_END, settle)
    return () => removeEventListener(NAV_END, settle)
  }, { scope: root })
}
