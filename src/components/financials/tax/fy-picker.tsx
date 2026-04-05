'use client'

export function FyPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const options = buildFyOptions()
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground">Financial year</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm border border-border rounded-md px-2 py-1 bg-white"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function buildFyOptions() {
  const now = new Date()
  const currentStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  const options: Array<{ value: string; label: string }> = []
  for (let i = 2; i >= -2; i--) {
    const start = currentStart - i
    const end = start + 1
    const value = `FY${start}-${String(end).slice(-2)}`
    const isCurrent = i === 0
    options.push({
      value,
      label: `${value}${isCurrent ? ' (current)' : ''}`,
    })
  }
  return options
}
