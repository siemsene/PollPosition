// Shared defaulting for rating-scale bounds so the student input and the
// results chart always agree on the range.
export function scaleBounds(min: number | null | undefined, max: number | null | undefined) {
  const lo = typeof min === 'number' && Number.isFinite(min) ? min : 1
  const hi = typeof max === 'number' && Number.isFinite(max) ? max : 5
  return { min: lo, max: hi }
}
