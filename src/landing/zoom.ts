// Масштаб под экран. Главы рассчитаны на окно 1440×900; на большом мониторе содержимое занимало бы только часть экрана.
// Корневой блок страницы (#root) увеличивается через CSS zoom ровно настолько, чтобы глава заполнила окно по высоте и ширине.
// Меньше расчётного окна масштаб не уменьшается (там главы уплотняются стилями), на телефонах и узких окнах масштаба нет.
// Всплывающие окна Radix и диалог сети рисуются вне #root и масштаб не получают.
// ?scale=off в адресе отключает масштабирование.
const BASE_W = 1440, BASE_H = 900

export function computeScale() {
  let off = false
  try { off = new URLSearchParams(location.search).get('scale') === 'off' } catch { /* без параметров адреса */ }
  const raw = Math.min(innerWidth / BASE_W, innerHeight / BASE_H)
  return off || innerWidth < 1200 || raw < 1.05 ? 1 : Math.min(raw, 2.4)
}

/** Записывает масштаб в --z; единицы vh/vw в стилях делятся на него (в zoom они не пересчитываются сами). */
export function applyScale() {
  document.documentElement.style.setProperty('--z', String(+computeScale().toFixed(3)))
}

export function watchScale() {
  applyScale()
  let raf = 0
  const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(applyScale) }
  addEventListener('resize', on)
  addEventListener('orientationchange', on)
}

/** Общий масштаб элемента: экранные пиксели на CSS-пиксель (учитывает zoom корня; вне #root равен 1). */
export const scaleOf = (el: Element) => {
  const w = (el as HTMLElement).offsetWidth
  return w ? el.getBoundingClientRect().width / w : 1
}
