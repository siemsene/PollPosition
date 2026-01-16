export function safeParseNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

export function sturgesBins(n: number) {
  if (n <= 1) return 1
  return Math.max(3, Math.ceil(Math.log2(n) + 1))
}

export function numericHistogram(values: number[]) {
  const n = values.length
  if (n === 0) return { bins: [] as { name: string, count: number }[], min: 0, max: 0 }

  const filtered = excludeOutliers(values)
  const data = filtered.length > 0 ? filtered : values
  const min = Math.min(...data)
  const max = Math.max(...data)
  if (min === max) {
    return {
      bins: [{ name: `${min}`, count: data.length }],
      min,
      max
    }
  }

  const k = sturgesBins(data.length)
  const width = (max - min) / k

  const counts = new Array(k).fill(0)
  for (const v of data) {
    let idx = Math.floor((v - min) / width)
    if (idx === k) idx = k - 1
    counts[idx]++
  }

  const bins = counts.map((count, i) => {
    const a = min + i * width
    const b = i === k - 1 ? max : (min + (i + 1) * width)
    const name = `${roundNice(a)}-${roundNice(b)}`
    return { name, count }
  })

  return { bins, min, max }
}

function roundNice(x: number) {
  return `${Math.round(x)}`
}

export function excludeOutliers(values: number[]) {
  if (values.length < 4) return values
  const sorted = values.slice().sort((a, b) => a - b)
  const q1 = quantile(sorted, 0.25)
  const q3 = quantile(sorted, 0.75)
  const iqr = q3 - q1
  if (!Number.isFinite(iqr) || iqr === 0) return values
  const low = q1 - 1.5 * iqr
  const high = q3 + 1.5 * iqr
  return sorted.filter((v) => v >= low && v <= high)
}

function quantile(sorted: number[], q: number) {
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = sorted[base + 1]
  if (next === undefined) return sorted[base]
  return sorted[base] + rest * (next - sorted[base])
}
