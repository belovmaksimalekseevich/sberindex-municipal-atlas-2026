import type { ConfigMonth } from './data'

const SSE6_DECEMBER_NAMES: Record<number, string> = {
  0: 'Повышенный уровень расходов',
  1: 'Низкие расходы, особенно на питание вне дома',
  2: 'Средний расходный уровень',
  3: 'Самые низкие общие расходы',
  4: 'Высокие расходы по большинству категорий',
  5: 'Высокие расходы, особенно на продукты',
}

/** Только экранные названия декабря SSE6; исходные файлы, метки и числа не меняются. */
export function withDisplayNames(months: ConfigMonth[]): ConfigMonth[] {
  return months.map(cm => cm.config_id === 'SSE_K06' && cm.month === '2024-12'
    ? { ...cm, clusters: cm.clusters.map(c => ({ ...c, name: SSE6_DECEMBER_NAMES[c.g] ?? c.name })) }
    : cm)
}

/** Понятное название категории в коротких описаниях принятых карточек. */
export function displaySpendingText(text: string): string {
  return text
    .replaceAll('общественного питания', 'питания вне дома')
    .replaceAll('общественное питание', 'питание вне дома')
    .replaceAll('общепита', 'питания вне дома')
    .replaceAll('общепит', 'питание вне дома')
}
