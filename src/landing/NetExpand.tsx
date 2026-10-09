import { useEffect, useState, type ComponentProps } from 'react'
import { Dialog as D } from 'radix-ui'
import { Maximize2, X } from 'lucide-react'
import { T, clusterOf, rankColor, rankOrder, rub } from './data'
import { Network } from './Network'
import { NetInteractive } from './NetInteractive'

type NetProps = ComponentProps<typeof Network>

/** Пропорции холста под текущее окно: сеть занимает всё доступное место без прокрутки. */
function useViewportRatio(open: boolean) {
  const calc = () => Math.max(0.6, Math.min(2.4, (window.innerWidth - 48) / Math.max(180, window.innerHeight - 240)))
  const [ratio, setRatio] = useState(1.6)
  useEffect(() => {
    if (!open) return
    const on = () => setRatio(calc())
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [open])
  return ratio
}

/** Кнопка «На весь экран» и полноэкранный просмотр той же сети.
 *  Оверлей на всё окно, а не Fullscreen API: тот запрещён во встроенных просмотрщиках, оверлей работает везде. */
export function NetExpand({ title, caption, net }: { title: string; caption?: string; net: NetProps }) {
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState<number | null>(null)
  const [picked, setPicked] = useState<number | null>(net.selected ?? null)
  const ratio = useViewportRatio(open)
  const { cm, obs } = net
  const selection = `${cm.config_id}:${cm.month}:${net.selected ?? ''}`
  const [previousSelection, setPreviousSelection] = useState(selection)
  if (previousSelection !== selection) {
    setPreviousSelection(selection)
    setFocus(null)
    setPicked(net.selected ?? null)
  }
  const pick = (ti: number) => { setPicked(ti); net.onPick?.(ti) }
  const lab = picked !== null ? cm.lab[picked] : null
  const pc = typeof lab === 'number' ? clusterOf(cm, lab) : undefined
  return (
    <D.Root open={open} onOpenChange={o => { setOpen(o); if (o) setPicked(net.selected ?? null) }}>
      <D.Trigger className="btn btn-line btn-sm inline-flex items-center gap-1.5 text-[13px]">
        <Maximize2 aria-hidden className="size-3.5" /> На весь экран
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-paper" />
        <D.Content className="fixed inset-0 z-[61] flex flex-col bg-paper px-6 pt-4 pb-3 text-ink outline-none" aria-describedby={undefined}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <D.Title className="text-lg font-semibold">{title}</D.Title>
            <ul className="flex flex-wrap gap-1" aria-label="Подсветить группу">
              {rankOrder(cm).map(g => {
                const c = clusterOf(cm, g)!
                return (
                  <li key={g}>
                    <button title={c.name} aria-label={`G${g}: ${c.name}, ${c.size} МО`} aria-pressed={focus === g} onClick={() => setFocus(f => (f === g ? null : g))}
                      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] hover:bg-surface aria-pressed:bg-surface aria-pressed:font-semibold">
                      <i className="h-2.5 w-2.5 rounded-full" style={{ background: rankColor(cm, g) }} />G{g}: {c.size}
                    </button>
                  </li>
                )
              })}
            </ul>
            <D.Close className="btn btn-line ml-auto inline-flex items-center gap-1.5" aria-label="Закрыть полноэкранный режим">
              <X aria-hidden className="size-4" /> Закрыть
            </D.Close>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="w-full" style={{ maxWidth: `calc((100dvh - 240px) * ${ratio})` }}>
              <NetInteractive cm={cm} net={net.net} obs={obs} focus={focus} selected={picked} onPick={pick} ratio={ratio} label={net.label} />
            </div>
          </div>
          <p className="min-h-[1.5em] text-[13px] text-muted-ink" aria-live="polite">
            {picked !== null
              ? <><b className="text-ink">{T[picked].name}</b>: {pc ? pc.name : 'не в группе'}, «Все категории» {rub(obs[picked]?.[1][0])}. </>
              : 'Колесо или щипок — масштаб, перетаскивание фона — сдвиг, точки можно двигать. Нажмите на точку, чтобы увидеть МО. '}
            {caption}
          </p>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
