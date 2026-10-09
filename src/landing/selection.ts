import { createContext, use } from 'react'

interface View { config: string; setConfig: (id: string) => void; mi: number; setMi: (i: number) => void }
interface Mo { ti: number; setTi: (ti: number) => void }
type Selection = View & Mo
// два контекста: выбор МО в паспорте не перерисовывает таблицы и сети, выбор месяца — паспорт
export const ViewCtx = createContext<View | null>(null)
export const MoCtx = createContext<Mo | null>(null)

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
