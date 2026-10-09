import { startTransition, useEffect, useRef, useState, ViewTransition } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandGroup, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { LEAD, MONTHS, SCOPE_NOTE, T, base, catalogOf, monthLabel, monthShort, prefetch, useConfig } from './data'
import { useView } from './selection'
import { whenFull } from './nat/steps'
import { goTo, STRIP } from './navigation'


/** Короткая подпись охвата в шапке: видна на любом экране, полная — во всплывающей подсказке и в меню. */
const SCOPE_SHORT = `${T.length.toLocaleString('ru-RU')} территорий · ${MONTHS.length} мес. · проверенные расходные профили`
const SCOPE_XS = 'описательная типология расходов · 2023–2024'
const GROUPS = [
  { title: 'Подробное представление', items: base.catalog.filter(c => c.config_id === 'NCut_K10') },
  { title: 'Сравнение и укрупнение', items: base.catalog.filter(c => c.fit_method === 'SSE') },
]
/** Короткая подпись для узкой шапки: отличительная часть названия (полное название в списке и в aria-label). */
const shortOf = (id: string) => {
  return ({ NCut_K10: 'NCut · 10 групп', SSE_K10: 'SSE · 10 групп', SSE_K06: 'SSE · 6 групп' } as Record<string, string>)[id] ?? catalogOf(id).display_name
}
const hintOf = (id: string) => {
  return ({ NCut_K10: 'Десять подробных сетевых профилей расходов', SSE_K10: 'Другой метод разбиения при том же K = 10', SSE_K06: 'Шесть укрупнённых профилей; часть различий объединяется' } as Record<string, string>)[id] ?? ''
}

export function SiteHeader() {
  const [active, setActive] = useState<string | null>(null)
  const strip = useRef<HTMLElement>(null)
  // высота шапки в CSS (--head-h): главы, закреплённые сцены и привязка прокрутки считают отступы от неё
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('[data-site-header]')
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--head-h', `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set); ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // текущий раздел — по линии на 40% высоты окна (IntersectionObserver, без чтения раскладки при прокрутке)
  useEffect(() => whenFull(() => {
    // у глав якорь — заголовок, а наблюдаем весь блок главы (заголовок + шаги)
    const vis = new Map<string, boolean>(), idOf = new Map<Element, string>()
    const io = new IntersectionObserver(es => {
      es.forEach(e => vis.set(idOf.get(e.target)!, e.isIntersecting))
      const cur = STRIP.find(([id]) => vis.get(id))
      setActive(cur ? cur[0] : null)
    }, { rootMargin: '-40% 0px -59% 0px' })
    STRIP.forEach(([id]) => { const el = document.getElementById(id); const t = el; if (t) { idOf.set(t, id); io.observe(t) } })
    return () => io.disconnect()
  }), [])
  // активный пункт виден в полосе (на узком экране полоса листается)
  useEffect(() => {
    const list = strip.current, a = active ? list?.querySelector<HTMLElement>(`a[href="#${active}"]`) : null
    if (!list) return
    if (!a) { list.scrollLeft = 0; return }
    const l = a.offsetLeft, r = l + a.offsetWidth
    if (l < list.scrollLeft || r > list.scrollLeft + list.clientWidth) list.scrollLeft = l - 16
  }, [active])
  // все ссылки на разделы страницы ведут через goTo; ничего не перехватываем при клавише-модификаторе
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element).closest?.('a[href^="#"]') as HTMLAnchorElement | null
      const hash = a?.getAttribute('href')
      if (!a || !hash || hash === '#' || !document.getElementById(hash.slice(1))) return
      e.preventDefault()
      goTo(hash)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return (
    <header data-site-header className="sticky top-0 z-30 border-b-2 border-ink bg-paper">
      <div className="wrap-x flex min-h-11 items-center gap-4 py-1">
        <a href="#top" className="grid min-w-0 shrink leading-tight no-underline sm:flex sm:items-baseline sm:gap-4">
          <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">Сходство муниципалитетов</span>
          {/* охват расчёта виден всегда */}
          <span className="scope-mini max-sm:hidden" title={SCOPE_NOTE}>{SCOPE_SHORT}</span>
          <span className="scope-mini sm:hidden">{SCOPE_XS}</span>
        </a>
      </div>
      <nav ref={strip} aria-label="Главы и разделы" className="ch-strip">
        <div className="wrap-x ch-strip-in">
          {STRIP.map(([id, n, label]) => (
            <a key={id} href={`#${id}`} aria-current={active === id ? 'location' : undefined}><b>{n}</b>{label}</a>
          ))}
        </div>
      </nav>
    </header>
  )
}

export function ResetLink() {
  const { config, setConfig } = useView()
  const entry = useConfig(config)
  if (entry.state === 'loading') return <span className="hidden text-[13px] text-muted-ink sm:inline" role="status">загружаем вариант…</span>
  if (config === LEAD) return null
  return (
    <button onClick={() => startTransition(() => setConfig(LEAD))} className="hidden shrink-0 text-[13px] underline decoration-line underline-offset-4 hover:decoration-ink xl:inline">
      вернуть выбранный исследованием
    </button>
  )
}

/** Выбор варианта: две понятные группы (что сравниваем), подсказка к каждому пункту, отметка выбранного исследованием.
 *  Popover + Command (cmdk): стрелки, Enter, Esc, фокус возвращается на кнопку. Файлы вариантов подгружаются при наведении. */
export function VariantPicker() {
  const { config, setConfig } = useView()
  const [open, setOpen] = useState(false)
  const [hl, setHl] = useState(config)
  const warm = () => base.catalog.forEach(c => prefetch(c.config_id))
  const cur = catalogOf(config)
  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (o) setHl(config) }}>
      <PopoverTrigger asChild>
        <button onPointerEnter={warm} onFocus={warm} aria-label={`Вариант: ${cur.display_name}. Изменить`}
          className="group flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-ink/80 bg-surface pr-2 pl-3 text-left text-[13px] sm:pr-3 sm:pl-4 sm:text-sm transition-[border-color,transform] duration-150 hover:border-ink active:scale-[0.98] sm:max-w-[min(46vw,600px)] sm:flex-none">
          <span className="hidden shrink-0 text-muted-ink sm:inline">Вариант</span>
          <ViewTransition key={config} enter="name-in" exit="name-out" default="none">
            <span className="min-w-0 truncate font-medium"><span className="sm:hidden">{shortOf(config)}</span><span className="max-sm:hidden">{cur.display_name}</span></span>
          </ViewTransition>
          {config === LEAD && <span className="hidden shrink-0 rounded-full bg-ink px-2 py-0.5 text-[11px] leading-4 text-paper md:inline">выбран исследованием</span>}
          <ChevronDown aria-hidden strokeWidth={1.75} className="ml-auto size-4 shrink-0 text-muted-ink transition-transform duration-200 group-aria-expanded:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[min(92vw,440px)] p-0">
        <Command value={hl} onValueChange={setHl} loop>
          <CommandList className="max-h-[min(70vh,460px)]">
            {GROUPS.map((g, gi) => (
              <div key={g.title}>
                {gi > 0 && <CommandSeparator />}
                <CommandGroup heading={g.title}>
                  {g.items.map(c => (
                    <CommandItem key={c.config_id} value={c.config_id} data-checked={c.config_id === config}
                      onSelect={() => { setOpen(false); startTransition(() => setConfig(c.config_id)) }} className="items-start gap-3 rounded-md px-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">{c.display_name}
                          {c.config_id === LEAD && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] leading-4 font-normal text-paper">выбран исследованием</span>}
                        </span>
                        <span className="block text-[13px] text-muted-ink">{hintOf(c.config_id)}</span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
          <p className="border-t border-line px-4 py-3 text-[12px] leading-snug text-muted-ink">
            Выбор обновляет атлас, паспорт, сеть и метрики. Рёбра общей сети остаются теми же; меняются группы. Вступительная история отдельно показывает NCut10 за декабрь 2024. Основной вариант — описательный выбор, а не победитель по всем метрикам.
          </p>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Месяц: шаги назад/вперёд всегда, ползунок на широком экране и в листе меню. */
export function MonthControl({ full = false }: { full?: boolean }) {
  const { mi, setMi } = useView()
  const last = MONTHS.length - 1
  const m = MONTHS[mi].month
  return (
    <div role="group" aria-label="Месяц" className={`flex items-center gap-1 sm:gap-1.5 ${full ? 'w-full flex-wrap gap-y-3' : 'shrink-0 sm:min-w-[300px] sm:flex-1 lg:max-w-[460px]'}`}>
      {full && <p className="w-full text-[13px] text-muted-ink">Месяц</p>}
      <button onClick={() => setMi(Math.max(0, mi - 1))} disabled={mi === 0} aria-label="Предыдущий месяц" className="step-btn"><ChevronLeft aria-hidden strokeWidth={1.75} className="size-4" /></button>
      <span className="min-w-[3.6rem] text-center font-mono text-[13px] tnum sm:min-w-[7.2rem]" aria-live="polite">
        <span className="sm:hidden">{monthShort(m)} {m.slice(2, 4)}</span><span className="max-sm:hidden">{monthLabel(m)}</span>
      </span>
      <button onClick={() => setMi(Math.min(last, mi + 1))} disabled={mi === last} aria-label="Следующий месяц" className="step-btn"><ChevronRight aria-hidden strokeWidth={1.75} className="size-4" /></button>
      <Slider min={0} max={last} step={1} value={[mi]} aria-label="Месяц" onValueChange={([v]) => setMi(v)}
        className={`ml-2 flex-1 [&_[data-slot=slider-range]]:bg-ink [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-ink ${full ? 'min-w-full !ml-0' : 'max-sm:hidden'}`} />
    </div>
  )
}

/** Переключатели у раздела: вариант и/или месяц. Выбор общий для страницы — все разделы показывают одно и то же сочетание. */
export function SectionControls({ variant = false, month = false, note }: { variant?: boolean; month?: boolean; note?: string }) {
  return (
    <div className="section-controls mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
      {variant && <div className="flex w-[min(100%,620px)] min-w-0">{<VariantPicker />}</div>}
      {month && <MonthControl />}
      {variant && <ResetLink />}
      {note && <span className="w-full text-[13px] text-muted-ink">{note}</span>}
    </div>
  )
}
