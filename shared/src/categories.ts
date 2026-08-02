export interface Category {
  slug: string
  label: string
  emoji: string
}

export const CATEGORIES: readonly Category[] = [
  { slug: 'general', label: 'General', emoji: '🧾' },
  { slug: 'food', label: 'Food & drink', emoji: '🍽️' },
  { slug: 'groceries', label: 'Groceries', emoji: '🛒' },
  { slug: 'transport', label: 'Transport', emoji: '🚕' },
  { slug: 'accommodation', label: 'Accommodation', emoji: '🏠' },
  { slug: 'entertainment', label: 'Entertainment', emoji: '🎟️' },
  { slug: 'utilities', label: 'Bills & utilities', emoji: '💡' },
  { slug: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { slug: 'health', label: 'Health', emoji: '💊' },
  { slug: 'travel', label: 'Travel', emoji: '✈️' },
  { slug: 'other', label: 'Other', emoji: '📦' },
]

const slugs = new Set(CATEGORIES.map((c) => c.slug))

export function isCategorySlug(slug: string): boolean {
  return slugs.has(slug)
}

export function categoryEmoji(slug: string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.emoji ?? '🧾'
}
