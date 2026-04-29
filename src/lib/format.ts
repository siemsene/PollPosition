export function formatUsd(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '$0.00'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

export function questionTypeLabel(type: string) {
  if (type === 'mcq') return 'Multiple choice'
  if (type === 'pie') return '100 point allocation'
  if (type === 'number') return 'Numerical'
  if (type === 'short') return 'Short text'
  return 'Extended text'
}
