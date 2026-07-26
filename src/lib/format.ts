export function formatUsd(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '$0.00'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

export function questionTypeLabel(type: string) {
  if (type === 'mcq') return 'Multiple choice'
  if (type === 'multi') return 'Multiple select'
  if (type === 'pie') return '100 point allocation'
  if (type === 'number') return 'Numerical'
  if (type === 'scale') return 'Rating scale'
  if (type === 'rank') return 'Ranking'
  if (type === 'short') return 'Short text'
  if (type === 'cloud') return 'Word cloud'
  return 'Extended text'
}
