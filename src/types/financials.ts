// Category taxonomy for transaction classification
export const CATEGORIES = {
  'BUSINESS EXPENSES': ['Contractors & Services', 'Equipment & Technology', 'Professional Services', 'Marketing & Advertising'],
  'DINING & COFFEE': ['Lunch', 'Dinner Out', 'Takeaway', 'Cafes & Coffee', 'Drinks / Bar'],
  'DONATIONS & GIVING': ['Church / Religious', 'Charity', 'Community / School', 'Sponsorship'],
  'EDUCATION & CHILDCARE': ['School Fees', 'Childcare', 'Courses & Books'],
  'FINANCIAL': ['Bank Fees', 'Credit Card Payments', 'Loan Repayments'],
  'GROCERIES': ['Supermarket', 'Butcher / Bakery', 'Market / Deli'],
  'HEALTH': ['Medical / GP / Specialist', 'Pharmacy', 'Dental', 'Allied Health'],
  'HOUSING': ['Mortgage / Rent', 'Strata / Body Corporate', 'Maintenance & Repairs'],
  'HOUSEHOLD BILLS': ['Electricity', 'Gas', 'Water', 'Council Rates', 'Internet', 'Phone / Mobile'],
  'INCOME': ['Salary / Payroll', 'Freelance / Consulting', 'Investment Returns', 'Government Benefits', 'Other Income'],
  'INSURANCE': ['Life & Income Protection', 'Health Insurance', 'Home & Contents', 'Car / Motor Vehicle', 'Pet Insurance', 'Business Insurance'],
  'KIDS & PETS': ['Kids Activities', 'Kids Clothing', 'Pet Food', 'Vet', 'Pet Grooming', 'Dog Walker / Daycare'],
  'INVESTMENTS': ['Shares / ETFs', 'Managed Funds', 'Super Contributions', 'Property Investment', 'Crypto', 'Dividends & Distributions'],
  'SHOPPING & LIFESTYLE': ['Clothing & Apparel', 'Electronics & Tech', 'Home & Garden', 'Gifts'],
  'SPORTS & FITNESS': ['Soccer / Football', 'Gym & Fitness', 'Swimming', 'Sports Equipment', 'Other Sports'],
  'SUBSCRIPTIONS & DIGITAL': ['Streaming', 'Software & SaaS', 'Cloud Services', 'Telco', 'News & Media'],
  'TRANSFERS': ['Internal Transfer', 'Family Transfer'],
  'TRANSPORT': ['Tesla / EV Charging', 'Fuel', 'Rego & CTP', 'Tolls & Parking', 'Public Transport', 'Uber / Rideshare'],
  'TRAVEL': ['Flights', 'Hotels & Accommodation', 'Car Rental', 'Travel Insurance', 'Activities & Tours'],
  'OTHER': [],
} as const

export type CategoryKey = keyof typeof CATEGORIES

export const ACCOUNT_TYPES = ['personal_cheque', 'personal_savings', 'business_cheque', 'credit_card'] as const
export type AccountType = typeof ACCOUNT_TYPES[number]

export const OWNER_TYPES = ['maged', 'family', 'business'] as const
export type OwnerType = typeof OWNER_TYPES[number]

export const TAX_CATEGORIES = ['work_expense', 'investment', 'donation'] as const
export type TaxCategory = typeof TAX_CATEGORIES[number]

// =====================
// Phase F1 — Tax Prep types
// =====================

export type AtoScope = 'personal' | 'company'
export type AtoSection = 'income' | 'deduction' | 'expense' | 'other'

export interface AtoCode {
  code: string
  scope: AtoScope
  section: AtoSection
  label: string
  description: string | null
  sortOrder: number
  isInternalSubcode: boolean
  rollsUpTo: string | null
}

export interface InvoiceFile {
  gdriveFileId: string
  filename: string
  driveUrl: string
  mimeType: string
  modifiedTime: string
  sizeBytes: number | null
  tag: InvoiceTag | null
}

export interface InvoiceTag {
  supplier: string | null
  amount: number | null
  atoCodePersonal: string | null
  atoCodeCompany: string | null
  linkedTxnId: string | null
  matchStatus: 'matched' | 'unmatched' | 'verified'
  notes: string | null
}

export type ExportJobStatus = 'pending' | 'running' | 'complete' | 'error' | 'cancelled'

export interface ExportJob {
  id: string
  fy: string
  status: ExportJobStatus
  progressPercent: number
  currentStep: string | null
  blobUrl: string | null
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
  expiresAt: string
}

export interface ExportProgressEvent {
  type: 'progress' | 'complete' | 'error'
  step?: string
  percent?: number
  blobUrl?: string
  expiresAt?: string
  message?: string
}

export interface AiCostEstimate {
  model: string
  pricing: { inputPer1M: number; outputPer1M: number; currency: string; asOf: string }
  estimates: {
    perImport: { txnCount: number; cost: number }
    monthly: { txnCount: number; cost: number }
    backfill?: { txnCount: number; cost: number }
  }
  currentSetting: { enabled: boolean }
}

export interface AtoProposal {
  aiPersonal: string | null
  aiCompany: string | null
}

// =====================
// Invoice Reader Integration (v0.1.3)
// =====================

export interface InvoiceSupplierConfig {
  id: string
  entityId: string | null
  entityName?: string
  name: string
  gmailLabel: string | null
  keywords: string[]
  fy: string
  defaultAtoCode: string | null
  isActive: boolean
  lastScannedAt: string | null
}

export interface ExtractedInvoice {
  invoiceNumber: string | null
  invoiceDate: string | null
  purchaseDate: string | null
  serviceDate: string | null
  referenceNumber: string | null
  supplierName: string | null
  location: string | null
  serviceType: string | null
  description: string | null
  emailType: 'Invoice' | 'Receipt' | 'Payment Confirmation' | 'Other'
  subTotal: number | null
  gstAmount: number | null
  totalAmount: number | null
  rawText: string
}

export interface InvoiceRecord {
  id: string
  supplierId: string | null
  entityId: string | null
  fy: string
  invoiceNumber: string | null
  invoiceDate: string | null
  purchaseDate: string | null
  serviceDate: string | null
  referenceNumber: string | null
  supplierName: string | null
  location: string | null
  serviceType: string | null
  description: string | null
  emailType: string | null
  subTotal: number | null
  gstAmount: number | null
  totalAmount: number | null
  pdfBlobUrl: string | null
  sourceEmailId: string | null
  sourceEmailDate: string | null
  sourceFrom: string | null
  atoCode: string | null
  linkedTxnId: string | null
  status: 'extracted' | 'verified' | 'linked' | 'excluded'
  createdAt: string
}

export interface ScanProgressEvent {
  type: 'progress' | 'complete' | 'error'
  step?: string
  percent?: number
  emailsFound?: number
  invoicesExtracted?: number
  message?: string
}

export const SUBSCRIPTION_FREQUENCIES = ['monthly', 'annual', 'weekly'] as const
export type SubscriptionFrequency = typeof SUBSCRIPTION_FREQUENCIES[number]

// Claude AI parse response shape
export interface ParsedTransaction {
  transaction_date: string // YYYY-MM-DD
  description_raw: string
  amount: number // negative = debit
  is_debit: boolean
  running_balance: number | null
  merchant_name: string | null
  category: string
  subcategory: string | null
  is_subscription: boolean
  subscription_frequency: SubscriptionFrequency | null
  is_tax_deductible: boolean
  tax_category: TaxCategory | null
}

export interface ParsedStatement {
  bank_name: string
  account_name: string
  account_number_last4: string
  bsb: string | null
  account_type: AccountType
  statement_start: string // YYYY-MM-DD
  statement_end: string // YYYY-MM-DD
  opening_balance: number
  closing_balance: number
  transactions: ParsedTransaction[]
}

// Scan API response
export interface ScanResult {
  total: number
  new_files: DriveFile[]
  duplicates: DriveFile[]
  already_imported: DriveFile[]
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  md5Checksum: string
  size: number
  fileType: 'pdf' | 'csv' | 'qfx' | 'unknown'
}

export const SUPPORTED_MIME_TYPES: Record<string, DriveFile['fileType']> = {
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'application/vnd.ms-excel': 'csv',
  'text/plain': 'csv',
  'application/x-ofx': 'qfx',
  'application/ofx': 'qfx',
  'application/vnd.intu.qfx': 'qfx',
}

export type SourceType = 'csv' | 'pdf_text' | 'pdf_ocr'

// Ingest progress event (SSE)
export interface IngestProgressEvent {
  type: 'progress' | 'complete' | 'error'
  current: number
  total: number
  file_name: string
  status: 'parsing' | 'parsed' | 'needs_review' | 'error' | 'duplicate'
  error_message?: string
  model_used?: string
  estimated_cost?: number
}

// Analytics types
export interface MonthlySummary {
  month: string // YYYY-MM
  income: number
  expenses: number
  net: number
  savings_rate: number
}

export interface SpendingByCategory {
  category: string
  amount: number
  percentage: number
  transaction_count: number
  vs_prior_period?: number
}

export interface SubscriptionInfo {
  merchant_name: string
  account_name: string
  amount: number
  frequency: SubscriptionFrequency
  estimated_annual_cost: number
  last_charged: string
  is_duplicate_across_accounts: boolean
}

export interface CoverageMonth {
  month: string // YYYY-MM
  status: 'imported' | 'missing' | 'needs_review' | 'future'
}

export interface AccountCoverage {
  account_id: string
  bank_name: string
  account_name: string
  account_number_last4: string
  months: CoverageMonth[]
}
