import { useMemo, useRef, useState } from 'react'
import { stability } from './stability'
import mapRaw from './i26/map.json'
import newTerr from './i26/newterr.json'
import { MONTHS, T, catalogOf, monthLabel, monthShort, num, groupColor, type ConfigMonth } from './data'
import { useSelection } from './selection'
import { SectionControls } from './SiteHeader'
import { WithConfig } from './Toolbar'
import { useChapter, useOnEnter } from './reveal'
import { DUR, EASE, gsap } from './motion'

const MAPF = mapRaw as { W: number; H: number; paths: Record<string, string>; out: string }
const KINDS = [
  { kind: 'top', label: '24 месяца без смен после сопоставления' },
  { kind: 'switch', label: 'полная история со сменами' },
  { kind: 'bottom', label: 'неполная история' },
] as const

export function Flow() {
  const ref = useChapter<HTMLElement>()
  return (
    <section ref={ref} id="flow" aria-labelledby="flow-title" data-chapter className="py-16 lg:py-24">
      <h2 id="flow-title" className="chapter-title">Как меняется состав групп</h2>
      <SectionControls variant note="Динамика считается по всем 24 месяцам выбранного варианта" />
      <WithConfig>{months => <FlowBody months={months} />}</WithConfig>
    </section>
  )
}

function FlowBody({ months }: { months: ConfigMonth[] }) {
  const { config, ti, setTi } = useSelection()
  const { rows, moves, total, common } = useMemo(() => stability(config, months), [config, months])
  const counts = Object.fromEntries(KINDS.map(k => [k.kind, rows.filter(r => r.kind === k.kind).length])) as Record<string, number>
  const maxMoves = Math.max(1, ...moves.map(m => m.n))
  const sel = rows[ti]
  const aris = moves.map(m => m.t.ARI).filter((v): v is number => v != null)
  // распределение МО по числу смен группы
  const hist = useMemo(() => {
    const h = new Map<number, number>()
    rows.forEach(r => { if (r.switches > 0) h.set(r.switches, (h.get(r.switches) ?? 0) + 1) })
    return [...h.entries()].sort((a, b) => a[0] - b[0])
  }, [rows])
  const maxH = Math.max(1, ...hist.map(h => h[1]))
  const known = counts.top + counts.switch + counts.bottom
  const chart = useOnEnter<HTMLDivElement>(el => gsap.timeline({ defaults: { ease: EASE.out } })
    .from(el.querySelectorAll('[data-bar]'), { scaleY: 0, transformOrigin: '50% 100%', duration: DUR.reveal, stagger: 0.025 }, 0)
    .from(el.querySelectorAll('[data-seg]'), { scaleX: 0, transformOrigin: 'left center', duration: 1, ease: EASE.move, stagger: 0.1 }, 0.1)
    .from(el.querySelectorAll('[data-hbar]'), { scaleX: 0, transformOrigin: 'left center', duration: DUR.reveal, stagger: 0.04 }, 0.3))
  return (
    <div ref={chart}>
      <p data-lede className="chapter-lede">
        Вариант «{catalogOf(config).display_name}»: между соседними месяцами группу сменили {total.toLocaleString('ru-RU')} раз из {common.toLocaleString('ru-RU')} возможных ({common ? num((total / common) * 100, 0) : 0}%).
        {aris.length > 0 && ` Сходство разбиений соседних месяцев (ARI) от ${num(Math.min(...aris), 2)} до ${num(Math.max(...aris), 2)}.`}
      </p>

      {/* три вида МО в масштабе */}
      <div className="mt-10 flex h-[84px] border-2 border-ink" role="img" aria-label={KINDS.map(k => `${counts[k.kind]} МО ${k.label}`).join(', ')}>
        {KINDS.map(k => (
          <div key={k.kind} data-seg className="flex min-w-0 flex-col justify-center overflow-hidden border-r-2 border-ink px-4 last:border-r-0"
            style={{ flexGrow: counts[k.kind] || 0.0001, background: k.kind === 'top' ? 'var(--g2)' : k.kind === 'bottom' ? 'var(--g1)' : 'var(--mark)', color: k.kind === 'switch' ? 'var(--ink)' : '#fff' }}>
            <b className="font-[family-name:var(--display)] text-[34px] leading-none tnum">{counts[k.kind].toLocaleString('ru-RU')}</b>
            <span className="truncate text-[13px]">{k.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 font-mono text-[12px] text-muted-ink">из {known.toLocaleString('ru-RU')} МО; полные и неполные истории разделены. Смена определяется на общей опоре соседних месяцев, пропуски не соединяются.</p>

      <div className="mt-12 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <SwitchMap rows={rows} ti={ti} setTi={setTi} />
        <div className="grid content-start gap-10">
          <div>
            <h3 className="font-[family-name:var(--display)] text-[24px] uppercase leading-none">Сколько раз меняли группу</h3>
            <ul className="mt-4 grid gap-1.5">
              {hist.map(([k, n]) => (
                <li key={k} className="grid grid-cols-[86px_minmax(0,1fr)_52px] items-center gap-3 text-[14px]">
                  <span className="text-muted-ink">{k} {k === 1 ? 'раз' : k < 5 ? 'раза' : 'раз'}</span>
                  <span className="h-4"><i data-hbar className="block h-full" style={{ width: `${(n / maxH) * 100}%`, background: switchColor(k) }} /></span>
                  <span className="text-right font-mono tnum">{n}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-[family-name:var(--display)] text-[24px] uppercase leading-none">Смены по месяцам</h3>
            <div className="mt-4 grid h-28 grid-cols-24 items-end gap-0.5" role="img" aria-label={`Число МО, сменивших группу: ${moves.map(x => `${monthShort(x.t.to)} ${x.n}`).join(', ')}`}>
              <span />
              {moves.map(x => (
                <span key={x.t.to} className="flex h-full flex-col items-center justify-end" title={`${monthLabel(x.t.from)} → ${monthLabel(x.t.to)}: ${x.n} МО, ARI ${x.t.ARI != null ? num(x.t.ARI, 2) : 'нет'}`}>
                  <span className="font-mono text-[10px] text-muted-ink tnum">{x.n || ''}</span>
                  <span data-bar className="w-full bg-[var(--track)]" style={{ height: `${(x.n / maxMoves) * 70}%` }} />
                </span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-24 gap-0.5 font-mono text-[10px] text-muted-ink">
              {MONTHS.map((m, i) => <span key={m.month} className="overflow-visible whitespace-nowrap">{i % 6 === 0 ? `${monthShort(m.month)} ${m.month.slice(2, 4)}` : ''}</span>)}
            </div>
          </div>
          <div className="border-2 border-ink p-4">
            <p className="text-[15px]"><span className="font-semibold">{T[ti].name}</span>{T[ti].region ? `, ${T[ti].region}` : ''}: число смен после сопоставления — {sel.switches}; соседних пар с наблюдениями — {sel.comparedPairs}; публикаций — {sel.observed} из {months.length}.</p>
            <div className="mt-3 grid grid-cols-24 gap-0.5" role="img" aria-label="Группа выбранного МО по месяцам">
              {sel.ranks.map((r, i) => <span key={i} title={`${monthLabel(MONTHS[i].month)}: ${r == null ? 'нет публикации' : `цвет ${r + 1}; исходная G${months[i].lab[ti]}`}`} className={`h-5 ${r == null ? 'hatch' : ''}`} style={r == null ? undefined : { background: groupColor(r) }} />)}
            </div>
            <p className="mt-2 text-[12px] text-muted-ink">Цвета согласованы по максимальному пересечению состава соседних месяцев; штриховка — нет публикации. Цвет не означает постоянный экономический тип.</p>
          </div>
        </div>
      </div>
      <p className="mt-6 text-[13px] text-muted-ink">Группы сопоставлены по максимальной сумме пересечений на общих ID. Исходные номера не являются постоянными типами. Карта показывает смены присвоения, а не их причины; появления и пропуски не считаются сменами.</p>
    </div>
  )
}

const switchColor = (k: number) => (k <= 1 ? '#FFD23F' : k === 2 ? '#FF9F1C' : k <= 4 ? '#F0562B' : '#8C1C13')

/** Где МО меняли группу: карта справочника, МО без смен — бледно, менявшие — по числу смен. Клик выбирает МО. */
function SwitchMap({ rows, ti, setTi }: { rows: ReturnType<typeof stability>['rows']; ti: number; setTi: (ti: number) => void }) {
  const [tip, setTip] = useState<{ ti: number; x: number; y: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const sw = useMemo(() => new Map(rows.map(r => [r.ti, r.switches])), [rows])
  const idx = useMemo(() => new Map(T.map((t, i) => [t.id, i])), [])
  const shapes = useMemo(() => Object.entries(MAPF.paths).map(([id, d]) => ({ id, d, ti: idx.get(id) })), [idx])
  return (
    <figure className="m-0 min-w-0">
      <h3 className="font-[family-name:var(--display)] text-[24px] uppercase leading-none">Где меняли группу</h3>
      <div ref={box} className="relative mt-4 border-2 border-ink bg-white p-2"
        onPointerMove={e => { const a = (e.target as Element).getAttribute?.('data-ti'); if (a == null) { setTip(null); return } const r = box.current!.getBoundingClientRect(); setTip({ ti: +a, x: Math.min(e.clientX - r.left + 12, box.current!.clientWidth - 250), y: e.clientY - r.top }) }}
        onPointerLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${MAPF.W} ${MAPF.H}`} className="block w-full" role="img" aria-label="Карта МО, менявших группу">
          <path d={MAPF.out + newTerr.path} fill="#EEF0F4" stroke="#fff" strokeWidth={0.3} />
          {shapes.map(s => { const k = s.ti != null ? sw.get(s.ti) ?? 0 : 0; return (
            <path key={s.id} d={s.d} data-ti={s.ti} onClick={() => s.ti != null && setTi(s.ti)} className="cursor-pointer"
              fill={k > 0 ? switchColor(k) : '#E4E7EC'} stroke={s.ti === ti ? '#111' : '#fff'} strokeWidth={s.ti === ti ? 1.6 : 0.3} vectorEffect="non-scaling-stroke" />) })}
        </svg>
        {tip && (
          <div className="pointer-events-none absolute z-10 grid max-w-[240px] gap-0.5 bg-ink px-3 py-2 text-[13px] text-white shadow-[5px_5px_0_var(--mark)]"
            style={{ left: tip.x, top: tip.y + 12 }}>
            <b>{T[tip.ti].name}</b><span className="text-[#D5D8E0]">{T[tip.ti].region ?? ''}</span>
            <span>Число смен в наблюдаемых соседних парах — {sw.get(tip.ti) ?? 0}; публикаций — {rows[tip.ti].observed}/24</span>
          </div>
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-ink">
        {[1, 2, 3, 5].map(k => <span key={k} className="flex items-center gap-1.5"><i className="inline-block h-3 w-4 border border-ink" style={{ background: switchColor(k) }} />{k === 5 ? '5+ раз' : k === 3 ? '3–4 раза' : k === 2 ? '2 раза' : '1 раз'}</span>)}
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-4 border border-ink bg-[#E4E7EC]" />нет наблюдаемых смен</span>
      </figcaption>
    </figure>
  )
}
