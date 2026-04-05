// Assumption type catalogue
export const ASSUMPTION_TYPES = [
  { key: 'wfh_hours_per_week', label: 'WFH Hours/Week', valueType: 'numeric' as const, unit: 'hrs' },
  { key: 'home_office_method', label: 'Home Office Method', valueType: 'enum' as const, options: [
    { value: 'fixed_rate_67c', label: 'Fixed rate (67c/hr)' },
    { value: 'actual_cost', label: 'Actual cost' },
  ]},
  { key: 'home_office_floor_area_pct', label: 'Home Office Floor Area %', valueType: 'numeric' as const, unit: '%' },
  { key: 'phone_business_pct', label: 'Phone Business %', valueType: 'numeric' as const, unit: '%' },
  { key: 'internet_business_pct', label: 'Internet Business %', valueType: 'numeric' as const, unit: '%' },
  { key: 'vehicle_method', label: 'Vehicle Method', valueType: 'enum' as const, options: [
    { value: 'logbook', label: 'Logbook' },
    { value: 'cents_per_km', label: 'Cents per km' },
  ]},
  { key: 'vehicle_business_pct', label: 'Vehicle Business %', valueType: 'numeric' as const, unit: '%' },
  { key: 'utilities_business_pct', label: 'Utilities Business %', valueType: 'numeric' as const, unit: '%' },
  { key: 'entertainment_deductible_pct', label: 'Entertainment Deductible %', valueType: 'numeric' as const, unit: '%' },
] as const

export type AssumptionTypeKey = typeof ASSUMPTION_TYPES[number]['key']

export function getAssumptionType(key: string) {
  return ASSUMPTION_TYPES.find((t) => t.key === key)
}

export function formatAssumptionValue(type: string, valueNumeric: string | null, valueText: string | null): string {
  const typeDef = getAssumptionType(type)
  if (!typeDef) return valueNumeric ?? valueText ?? '—'

  if (typeDef.valueType === 'enum') {
    const option = typeDef.options.find((o) => o.value === valueText)
    return option?.label ?? valueText ?? '—'
  }

  if (valueNumeric == null) return '—'
  return `${valueNumeric}${typeDef.unit === '%' ? '%' : ` ${typeDef.unit}`}`
}

export function getAssumptionLabel(key: string): string {
  return getAssumptionType(key)?.label ?? key
}

// Australian FY helpers (July 1 — June 30)

export function getFyKey(d: Date): string {
  const y = d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear()
  return `FY${y}`
}

export function getFyTabs(): string[] {
  const now = new Date()
  const currentYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()
  return [`FY${currentYear - 1}`, `FY${currentYear}`, `FY${currentYear + 1}`]
}

export function getPreviousFy(fy: string): string {
  const year = parseInt(fy.replace('FY', ''), 10)
  return `FY${year - 1}`
}
