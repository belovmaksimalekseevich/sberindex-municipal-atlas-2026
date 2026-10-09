// Единая система движения лендинга (goated-ui: личность «Swiss precise»).
// Короткие длительности, out-quart, маски строк, рисующиеся линии; без отскоков, параллакса и вращений.
// Все плагины регистрируются один раз здесь; компоненты берут gsap только отсюда.
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { Flip } from 'gsap/Flip'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText, Flip, DrawSVGPlugin, ScrollToPlugin)

/** Токены: те же значения, что в CSS (--m-*). */
export const DUR = { ui: 0.16, base: 0.35, reveal: 0.6, morph: 0.8 } as const
export const EASE = { out: 'power4.out', move: 'power3.inOut', soft: 'power2.out' } as const
export const STAGGER = 0.04
/** Где срабатывает появление: верх блока на 85% высоты окна, один раз. */
export const REVEAL_START = 'top 85%'

export const reduced = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export { gsap, useGSAP, ScrollTrigger, SplitText, Flip }
