# Invoice Scanner — Rules & Logic (calibrated 2026-04-07)

## Scanning pipeline

```
1. GMAIL SEARCH
   Query: from:(sender_emails) (keywords + supplier_name) after:FY_start before:TODAY
   │
   ├─ Sender emails: specific addresses OR @domain patterns
   ├─ Keywords: supplier-configured + auto-includes supplier name words
   ├─ Date range: FY start date → today (extended beyond FY end to catch forwarded emails)
   │
2. PER EMAIL — download + parse
   │
   ├─ Dedup: skip if source_email_id already in invoices table
   ├─ Download email content (subject, body, HTML)
   ├─ Download + parse PDF attachments (including application/octet-stream with .pdf extension)
   ├─ Append PDF extracted text to email text content
   │
3. KEYWORD FILTER
   │
   ├─ Match keywords against: subject + stripped body + attachment filenames + PDF text
   ├─ Supplier name auto-included as keyword (catches "Good guys mobile jun25" etc.)
   ├─ If no keyword match → SKIP
   │
4. MARKETING FILTER
   │
   ├─ Has dollar amount in text? (checks both $XX.XX and bare XX.XX patterns)
   ├─ Has PDF attachment?
   ├─ If NO dollars AND NO PDF AND (stripped text > 3000 chars OR raw HTML > 20000 chars) → SKIP as marketing
   ├─ If HAS PDF → always proceed (invoice data may be in the PDF)
   │
5. EXTRACT FIELDS
   │
   ├─ Invoice number: subject regex, body regex (Invoice No, Order ID, Docket No, Document #)
   ├─ Dates: "Tax Invoice DD Month YYYY", "Purchased DD Month YYYY", "Invoice date: DD/MM/YYYY"
   ├─ Amounts: $-prefixed patterns, "Total including GST", "Amount due", "Billed to" prefix,
   │           bare numbers in short text (<3000 chars), "Goods Dispatched" pattern,
   │           largest number >10 fallback for PDF text (<5000 chars)
   ├─ GST: with and without $ prefix
   ├─ Email type: Invoice / Receipt / Payment Confirmation / Other
   │
6. FY FILTER (NEW)
   │
   ├─ Determine FY from INVOICE DATE (not email date)
   ├─ If no invoice date found, fall back to email date
   ├─ If invoice FY ≠ target FY → SKIP (email was scanned because it arrived
   │   after FY end, but the invoice itself belongs to a different FY)
   │
7. SAVE TO DB + UPLOAD PDF TO BLOB
```

## Supplier configuration rules

| Rule | What | Why |
|---|---|---|
| **Sender emails** | Use specific addresses (e.g. `microsoft-noreply@microsoft.com`) when the domain is shared with marketing/security. Use `@domain` when all emails from the domain are relevant. | `@microsoft.com` captured security alerts + marketing; specific address fixed it |
| **Forwarded senders** | Include `mboctor@dthree.io` + `mboctor@dthree.net` for all suppliers | User forwards invoices from business email to personal Gmail |
| **Keywords** | Include invoice-specific terms + supplier name words | Supplier name catches forwarded emails titled "Good guys mobile jun25" |
| **Domain vs specific** | Domain for suppliers that only send invoices (Wilson, OfficeWorks). Specific address for suppliers that also send marketing (Microsoft). | Calibrated per supplier based on noise observed |

## Current supplier configurations

| Supplier | Sender | Keywords | Notes |
|---|---|---|---|
| **Wilson Parking** | `@wilsonparking.com.au` + dthree | invoice, receipt, payment, Daily Pass Bundle, parking + auto: wilson, parking | Domain OK — Wilson only sends invoices + booking confirmations |
| **Good Guys Mobile** | `@thegoodguys.com.au` + `@email.thegoodguys.com.au` + dthree | good guys, goodguys, docket, invoice, receipt, order, tax invoice | Domain OK — keywords filter out marketing |
| **Apple Subscriptions** | `@mail.evernote.com` + `@email.apple.com` + dthree | tax invoice, receipt, subscription, Evernote, iCloud, Apple Music, renewal, billed | Merged Evernote + Apple Services (same Apple sender) |
| **Microsoft** | `microsoft-noreply@microsoft.com` + dthree | invoice, Microsoft 365, your microsoft invoice, billing, subscription | Specific address only — domain was too broad |
| **OfficeWorks** | `@officeworks.com.au` + dthree | Invoice, Order + auto: officeworks | Domain OK — very few emails from OfficeWorks |

## PDF handling rules

| Rule | What |
|---|---|
| **MIME detection** | `application/pdf` OR `application/octet-stream` with `.pdf` extension OR any MIME with `.pdf` filename |
| **Text extraction** | Dynamic import `pdf-parse` (requires `test/data/05-versions-space.pdf` to exist at project root) |
| **Blob upload** | Uploaded to Vercel Blob with `access: 'public'` — requires `BLOB_READ_WRITE_TOKEN` |
| **Marketing bypass** | If email has ANY PDF attachment, skip the marketing filter entirely |

## HTML-to-text rules (htmlToText function)

| Rule | What |
|---|---|
| Strip `<head>`, `<style>`, `<script>`, HTML comments | Remove non-content blocks |
| `</tr>` → newline | Preserve table row structure |
| `</td>`, `</th>` → ` \| ` | Separate cell content with pipe |
| `<td>`, `<th>` → space | Ensure content isn't concatenated |
| Block elements → newline | `</p>`, `</div>`, `</li>`, `</h1-6>`, `<hr>` |
| Entity decoding | `&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&#NNN;`, `&#xHH;` |
| Whitespace collapse | Horizontal spaces collapsed, multiple blank lines collapsed, each line trimmed |

## Amount extraction patterns (in priority order)

1. `Total, including GST $X.XX` — Wilson Parking format
2. `Total $X.XX` — generic with optional "Grand", "Amount"
3. `Amount due/paid/charged $X.XX`
4. `Total AUD X.XX`
5. `$X.XX Billed to` — Apple subscription format
6. Bare `$X.XX` in short text (<3000 chars) — catches simple invoices
7. `Goods Dispatched X.XX` — Good Guys docket format (no $ prefix)
8. Largest number >10 in short PDF text (<5000 chars) — last resort fallback
9. GST: with and without `$` prefix
10. Sub-total: with and without `$` prefix

## FY assignment rules

| Priority | Source | Example |
|---|---|---|
| 1 | Extracted invoice date from email body/PDF | "Tax Invoice 1 April 2026" → FY2025-26 |
| 2 | Email date (fallback if no invoice date) | Email received 2026-03-11 → FY2025-26 |
| 3 | Scan target FY (last resort) | User selected FY2024-25 → FY2024-25 |

Invoice must match the target FY to be saved. Emails from outside the FY are scanned (to catch forwarded emails) but only kept if the extracted invoice date falls within the target FY.
