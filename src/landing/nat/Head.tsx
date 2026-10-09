import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react'

/** Заголовок раздела: номер и вопрос закреплены под полосой глав, пока идёт раздел; ниже — короткий ответ. */
export function ChapterHead({ id, n, title, answer }: { id?: string; n: string; title: ReactNode; answer: ReactNode; as?: 'section' | 'header' }) {
  const tid = `${id ?? `s${n}`}-t`
  return (
    <>
      <header className="sec-pin">
        <span className="ch-num" aria-hidden>{n}</span>
        <h2 id={tid} className="ch-q">{title}</h2>
      </header>
      <p className="ch-a"><b>Коротко:</b> {answer}</p>
    </>
  )
}

/** Раздел страницы после истории: тот же заголовок, что у глав, и тело с общим ритмом отступов. */
export function Sec({ id, n, title, answer, children, className = '' }: { id: string; n: string; title: ReactNode; answer: ReactNode; children: ReactNode; className?: string }) {
  // внутри вкладки другого раздела — только содержимое, без своего заголовка
  if (use(BareCtx)) return <div className={`tab-body ${className}`}>{children}</div>
  return (
    <section id={id} className={`sec ${className}`} aria-labelledby={`${id}-t`}>
      <ChapterHead as="header" id={id} n={n} title={title} answer={answer} />
      <div className="sec-body">{children}</div>
    </section>
  )
}

/** Подзаголовок внутри раздела. */
export const SubH = ({ children, id }: { children: ReactNode; id?: string }) => <h3 id={id} className="sub-h">{children}</h3>

const BareCtx = createContext(false)
/** Содержимое бывшего раздела внутри вкладки: Sec рисует только тело. */
export const Bare = ({ children }: { children: ReactNode }) => <BareCtx value={true}>{children}</BareCtx>

export interface Tab { id: string; label: string; body: ReactNode }
/** Вкладки раздела: длинное содержимое не уходит вниз, а переключается. Панели смонтированы, неактивные скрыты.
 *  Переход по ссылке на панель (#groups) открывает её (событие tab:open из goTo). */
export function Tabs({ items, label }: { items: Tab[]; label: string }) {
  const [cur, setCur] = useState(items[0].id)
  const ids = useRef(items.map(t => t.id)); ids.current = items.map(t => t.id)
  useEffect(() => {
    const on = (e: Event) => { const id = (e as CustomEvent<string>).detail; if (ids.current.includes(id)) setCur(id) }
    addEventListener('tab:open', on)
    return () => removeEventListener('tab:open', on)
  }, [])
  // Панель доступна для следующего клика сразу после выбора вкладки.
  const choose = (id: string) => setCur(id)
  const key = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const k = ids.current.indexOf(cur), nx = ids.current[(k + (e.key === 'ArrowRight' ? 1 : ids.current.length - 1)) % ids.current.length]
    choose(nx); (e.currentTarget.querySelector(`#${nx}-tab`) as HTMLElement | null)?.focus()
  }
  return (
    <div className="tabs">
      <div role="tablist" aria-label={label} className="tab-list" onKeyDown={key}>
        {items.map(t => <button key={t.id} type="button" role="tab" id={`${t.id}-tab`} aria-selected={cur === t.id} aria-controls={t.id} tabIndex={cur === t.id ? 0 : -1} className="tab" onClick={() => choose(t.id)}>{t.label}</button>)}
      </div>
      <div className="tab-panels">
        {items.map(t => <div key={t.id} id={t.id} role="tabpanel" aria-labelledby={`${t.id}-tab`} data-tabpanel hidden={cur !== t.id} className="tab-panel">{t.body}</div>)}
      </div>
    </div>
  )
}
