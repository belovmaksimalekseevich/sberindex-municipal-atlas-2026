import { LEAD, MONTHS, prefetchNet } from './data'

/** Декабрьская сеть общая для трёх моделей; единый кэш исключает повторные запросы. */
export function prefetchRuleNets() { prefetchNet(LEAD, MONTHS.at(-1)!.month) }
