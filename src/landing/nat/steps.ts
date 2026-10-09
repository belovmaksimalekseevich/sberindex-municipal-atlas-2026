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

/** Шаг — последняя карточка, достигшая середины окна (80% высоты на узком экране). */
const LINE = () => (innerWidth < 861 ? 0.8 : 0.5)
export function useSteps(root: RefObject<HTMLElement | null>, setStep: (i: number) => void) {
  useGSAP(() => {
    const els = [...root.current!.querySelectorAll<HTMLElement>('[data-step]')]
    let current = -1
    const settle = () => {
      if (!els.length) return
      const line = innerHeight * LINE()
      let index = 0
      els.forEach((el, k) => { if (el.getBoundingClientRect().top <= line) index = k })
      const next = Number(els[index].dataset.step)
      if (next !== current) { current = next; setStep(next) }
    }
    const update = () => { if (!nav.busy) settle() }
    // Один диапазон включает и промежутки между карточками: быстрый скролл не пропускает шаг.
    ScrollTrigger.create({ trigger: root.current, start: 'top bottom', end: 'bottom top', onUpdate: update, onRefresh: update })
    update()
    addEventListener(NAV_END, settle)
    return () => removeEventListener(NAV_END, settle)
  }, { scope: root })
}
