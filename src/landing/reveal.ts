// Одна система появления на всю страницу: у главы рисуется верхняя линия, заголовок выходит из маски строк,
// вводный абзац проявляется следом. Остальное содержимое главы просто есть: графики появляются своим способом
// (сеть прорастает, столбики растут, линии рисуются), таблицы и тексты не анимируются.
import { useRef, type RefObject } from 'react'
import { DUR, EASE, REVEAL_START, STAGGER, ScrollTrigger, SplitText, gsap, reduced, useGSAP } from './motion'

/** Заголовок главы: линия сверху + маска строк h2 + вводный абзац [data-lede]. Ref вешается на section. */
export function useChapter<T extends HTMLElement = HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null)
  useGSAP((_, contextSafe) => {
    const root = ref.current
    if (!root || reduced() || !contextSafe) return
    const h2 = root.querySelector<HTMLElement>('h2')
    const lede = root.querySelectorAll<HTMLElement>(':scope [data-lede]')
    // при монтировании только запись стилей; всё, что читает раскладку, идёт позже и пачкой (без чередования чтения и записи)
    gsap.set(root, { '--rule': 0 })
    if (h2) gsap.set(h2, { autoAlpha: 0 })
    if (lede.length) gsap.set(lede, { autoAlpha: 0, y: 12 })
    let prepared = false
    const showNow = () => {
      prepared = true
      gsap.set(root, { '--rule': 1 })
      if (h2) gsap.set(h2, { clearProps: 'opacity,visibility' })
      if (lede.length) gsap.set(lede, { clearProps: 'transform,opacity,visibility' })
    }
    // строки режем, когда глава подходит к экрану и шрифты загружены: заранее посчитанные строки по запасному шрифту сдвинули бы вёрстку
    const prepare = contextSafe(() => {
      if (prepared) return
      prepared = true
      let split: SplitText | null = null
      if (h2) {
        split = SplitText.create(h2, { type: 'lines', mask: 'lines', linesClass: 'split-line', aria: 'auto' })
        gsap.set(h2, { autoAlpha: 1 })
        gsap.set(split.lines, { yPercent: 105 })
      }
      const tl = gsap.timeline({ paused: true, defaults: { ease: EASE.out } })
      tl.to(root, { '--rule': 1, duration: DUR.morph, ease: EASE.move }, 0)
      if (split) tl.to(split.lines, { yPercent: 0, duration: DUR.reveal, stagger: STAGGER * 2, onComplete: () => { split?.revert(); gsap.set(h2, { clearProps: 'opacity,visibility' }) } }, 0.1)
      if (lede.length) tl.to(lede, { autoAlpha: 1, y: 0, duration: DUR.reveal, stagger: STAGGER, clearProps: 'transform,visibility,opacity' }, 0.12)
      const st = ScrollTrigger.create({ trigger: h2 ?? root, start: 'top 92%', once: true, onEnter: () => tl.play() })
      if (st.progress === 1) tl.progress(1)
    })
    const arm = contextSafe(() => {
      const pre = ScrollTrigger.create({ trigger: h2 ?? root, start: 'top bottom+=400', once: true, onEnter: () => { document.fonts.ready.then(prepare) } })
      // глава уже позади (переход по меню вниз или загрузка с якорем): сразу итоговое состояние, без анимации за кадром
      if (pre.progress === 1 && !prepared) showNow()
    })
    requestAnimationFrame(arm)
  }, { scope: ref })
  return ref
}

/** Появление графика один раз при входе в экран. build получает корень и возвращает таймлайн (или null).
 *  Таймлайн строится сразу (только запись), триггер создаётся в следующем кадре вместе с остальными (одно чтение раскладки). */
export function useOnEnter<T extends Element = HTMLElement>(build: (el: T) => gsap.core.Timeline | gsap.core.Tween | null, deps: unknown[] = []) {
  const ref = useRef<T>(null)
  useGSAP((_, contextSafe) => {
    const el = ref.current
    if (!el || reduced() || !contextSafe) return
    const anim = build(el)
    if (!anim) return
    anim.pause()
    requestAnimationFrame(contextSafe(() => {
      const st = ScrollTrigger.create({ trigger: el, start: REVEAL_START, once: true, onEnter: () => anim.play() })
      if (st.progress === 1) anim.progress(1)
    }))
  }, { scope: ref, dependencies: deps })
  return ref
}
