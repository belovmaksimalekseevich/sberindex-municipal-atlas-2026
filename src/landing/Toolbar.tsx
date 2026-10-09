import type { ReactNode } from 'react'
import { LEAD, catalogOf, retry, useConfig, type ConfigMonth } from './data'
import { useSelection } from './state'

// Выбор варианта и месяца переехал в шапку (SiteHeader). Здесь остался общий шлюз данных для глав.

/** Показывает раздел только когда данные выбранного варианта загружены; иначе понятное состояние, а не старый вариант. */
export function WithConfig({ children, id }: { children: (months: ConfigMonth[]) => ReactNode; id?: string }) {
  const sel = useSelection()
  const cid = id ?? sel.config
  const entry = useConfig(cid)
  if (entry.state === 'ready') return <>{children(entry.data)}</>
  if (entry.state === 'loading') {
    return <div role="status" className="skeleton my-6 h-48" aria-label="Загружаем данные варианта" />
  }
  return (
    <div role="alert" className="my-6 rounded-lg border border-line bg-surface p-6">
      <p className="font-semibold">Не удалось загрузить вариант «{catalogOf(cid).display_name}»</p>
      <p className="mt-1 text-[15px] text-muted-ink">{entry.message}. Проверьте соединение и повторите либо вернитесь к варианту, выбранному исследованием.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={() => retry(cid)} className="btn btn-solid">Повторить загрузку</button>
        {cid !== LEAD && <button onClick={() => sel.setConfig(LEAD)} className="btn btn-line">Вернуться к выбранному</button>}
      </div>
    </div>
  )
}
