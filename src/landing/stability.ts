import { base, T, type ConfigMonth } from './data'

/** Смена присвоения на соседних общих ID после сохранённого max-overlap сопоставления. */
export function stability(config: string, months: ConfigMonth[]) {
  const trans = base.transitions[config] ?? []
  const rows = T.map((_, ti) => {
    const ranks = months.map(cm => cm.display_group[ti])
    let switches = 0, comparedPairs = 0
    trans.forEach(t => {
      const mi = months.findIndex(m => m.month === t.from)
      const left = months[mi]?.lab[ti], right = months[mi + 1]?.lab[ti]
      if (typeof left === 'number' && typeof right === 'number') {
        comparedPairs++
        if (t.from_raw_to_raw[String(left)] !== right) switches++
      }
    })
    const observed = ranks.filter(r => r != null).length, complete = observed === months.length
    const kind = !complete ? 'bottom' : switches > 0 ? 'switch' : 'top'
    return { ti, ranks, switches, kind, observed, complete, comparedPairs }
  })
  const moves = trans.map(t => ({ t, n: t.matched_changed_n }))
  return { rows, moves, total: moves.reduce((s, x) => s + x.n, 0), common: trans.reduce((s, t) => s + t.common, 0) }
}
