import { NAV_END, nav } from './nat/steps'

let navGuard = 0
/** Переход к разделу: сразу, без прокручивающей анимации (с поправкой на высоту шапки), затем фокус на заголовок.
 *  Главы выше цели могут догрузиться и сдвинуть её — положение доводится (до трёх раз). */
/** Далёкий переход — мягкое наложение вместо резкой смены экрана; без поддержки браузера или при «уменьшить движение» — мгновенно. */
const canFade = () => typeof document.startViewTransition === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches

export function goTo(hash: string, attempt = 0) {
  let el = hash.startsWith('#') ? document.getElementById(hash.slice(1)) : null
  if (!el) return
  // цель во вкладке: открываем вкладку и едем к её разделу
  const panel = el.closest<HTMLElement>('[data-tabpanel]')
  if (panel) { dispatchEvent(new CustomEvent('tab:open', { detail: panel.id })); el = panel.closest<HTMLElement>('section') ?? el }
  const node = el
  // высота шапки в экранных пикселях (getBoundingClientRect: при масштабе страницы offsetHeight даёт CSS-пиксели)
  const head = document.querySelector<HTMLElement>('[data-site-header]')?.getBoundingClientRect().height ?? 0
  if (attempt === 0) {
    history.replaceState(null, '', hash); nav.busy = true
    clearTimeout(navGuard); navGuard = window.setTimeout(() => { if (nav.busy) { nav.busy = false; dispatchEvent(new Event(NAV_END)) } }, 1500)
  }
  const top = () => node.getBoundingClientRect().top + scrollY - head
  const settle = () => requestAnimationFrame(() => {
    const off = node.getBoundingClientRect().top - head
    if (Math.abs(off) > 4 && attempt < 3) { goTo(hash, attempt + 1); return }
    nav.busy = false; dispatchEvent(new Event(NAV_END))
    const focusTarget = node.querySelector<HTMLElement>('h1, h2') ?? node
    if (!focusTarget.hasAttribute('tabindex')) focusTarget.setAttribute('tabindex', '-1')
    focusTarget.focus({ preventScroll: true })
  })
  if (attempt === 0 && canFade() && Math.abs(top() - scrollY) > innerHeight * 0.6) {
    const root = document.documentElement
    root.dataset.vt = 'jump'
    const vt = document.startViewTransition(() => { window.scrollTo({ top: top(), behavior: 'instant' as ScrollBehavior }) })
    // Поворот или изменение размера экрана может отменить снимок, но не переход к разделу.
    vt.ready.catch(() => {})
    vt.finished.catch(() => {}).finally(() => { delete root.dataset.vt; settle() })
    return
  }
  window.scrollTo({ top: top(), behavior: 'instant' as ScrollBehavior })
  settle()
}

/** Полоса глав и разделов под шапкой: номер и короткое название; текущий раздел подсвечен; на узком экране полоса листается вбок. */
export const STRIP = [
  ['top', '00', 'Главное'], ['story', '01', 'История'], ['atlas', '02', 'Атлас'], ['explore', '03', 'Найти МО'],
  ['rules', '04', 'Сеть'], ['methods', '05', 'Методы и ICVI'], ['how', '06', 'Как получено'],
] as const
