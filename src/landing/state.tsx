// Общий выбор на всю страницу: вариант (метод и представление), месяц и МО. Все разделы показывают одно и то же сочетание.
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LEAD, MONTHS, T, catalogOf } from './data'

// Выбор хранится в адресе (?v=вариант&m=месяц&mo=МО), чтобы ссылкой можно было поделиться ровно этим видом.
// Якорь (#раздел) не трогаем: им пользуется меню. В песочнице без доступа к history тихо работаем без адреса.
function readUrl() {
  try {
    const q = new URLSearchParams(location.search)
    const v = q.get('v'), m = q.get('m'), mo = Number(q.get('mo'))
    const mi = MONTHS.findIndex(x => x.month === m)
    return {
      config: v && catalogOf(v) ? v : undefined,
      mi: mi >= 0 ? mi : undefined,
      ti: q.has('mo') && Number.isInteger(mo) && mo >= 0 && mo < T.length ? mo : undefined,
    }
  } catch { return {} }
}

interface View { config: string; setConfig: (id: string) => void; mi: number; setMi: (i: number) => void }
interface Mo { ti: number; setTi: (ti: number) => void }
type Selection = View & Mo
// два контекста: выбор МО в паспорте не перерисовывает таблицы и сети, выбор месяца — паспорт
const ViewCtx = createContext<View | null>(null)
const MoCtx = createContext<Mo | null>(null)

export function SelectionProvider({ children, defaultTi }: { children: ReactNode; defaultTi: number }) {
  const [init] = useState(readUrl)
  const [config, setConfig] = useState(init.config ?? LEAD)
  const [mi, setMi] = useState(init.mi ?? MONTHS.length - 1)
  const [ti, setTi] = useState(init.ti ?? defaultTi)
  useEffect(() => {
    try {
      const q = new URLSearchParams(location.search)
      // значения по умолчанию в адрес не пишем: исходная ссылка остаётся чистой
      if (config === LEAD) q.delete('v'); else q.set('v', config)
      if (mi === MONTHS.length - 1) q.delete('m'); else q.set('m', MONTHS[mi].month)
      if (ti === defaultTi) q.delete('mo'); else q.set('mo', String(ti))
      const qs = q.toString()
      history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`)
    } catch { /* без доступа к адресу выбор живёт только на странице */ }
  }, [config, mi, ti, defaultTi])
  const view = useMemo(() => ({ config, setConfig, mi, setMi }), [config, mi])
  const mo = useMemo(() => ({ ti, setTi }), [ti])
  return <ViewCtx value={view}><MoCtx value={mo}>{children}</MoCtx></ViewCtx>
}

export function useView(): View {
  const v = use(ViewCtx)
  if (!v) throw new Error('useView вне SelectionProvider')
  return v
}
export function useMo(): Mo {
  const v = use(MoCtx)
  if (!v) throw new Error('useMo вне SelectionProvider')
  return v
}
/** Всё сразу (подписка на оба контекста) — для старых разделов. */
export function useSelection(): Selection {
  return { ...useView(), ...useMo() }
}
