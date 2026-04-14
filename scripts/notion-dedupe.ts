/**
 * Notion workspace duplicate scanner.
 *
 * Run: npm run dedupe:scan
 *
 * Enumerates all pages accessible to the NOTION_DEDUPE_TOKEN integration,
 * hashes title + body, clusters duplicates, writes CSV + JSON report.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from 'dotenv'

config({ path: '.env.local' })

const TOKEN = process.env.NOTION_DEDUPE_TOKEN
if (!TOKEN) {
  console.error('NOTION_DEDUPE_TOKEN missing in .env.local')
  process.exit(1)
}

const API = 'https://api.notion.com/v1'
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
}

const SIM_THRESHOLD = 0.8
const SHINGLE_SIZE = 5

type NotionPage = {
  id: string
  url: string
  created_time: string
  last_edited_time: string
  parent: { type: string; page_id?: string; database_id?: string; workspace?: boolean }
  in_trash?: boolean
  properties: Record<string, any>
}

type Enriched = {
  id: string
  url: string
  title: string
  titleNorm: string
  bodyText: string
  bodyHash: string
  bodyLen: number
  blockCount: number
  shingles: Set<string>
  created: string
  edited: string
  parentType: string
}

type Cluster = {
  id: number
  pages: Enriched[]
  confidence: number
  reason: string
}

async function notion(path: string, body?: any): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${path}: ${text}`)
  }
  return res.json()
}

async function enumeratePages(): Promise<NotionPage[]> {
  const all: NotionPage[] = []
  let cursor: string | undefined
  let page = 0
  while (true) {
    page++
    const body: any = { page_size: 100, filter: { value: 'page', property: 'object' } }
    if (cursor) body.start_cursor = cursor
    const res = await notion('/search', body)
    all.push(...res.results)
    process.stdout.write(`\rEnumerated ${all.length} pages (batch ${page})...`)
    if (!res.has_more) break
    cursor = res.next_cursor
  }
  process.stdout.write('\n')
  return all.filter((p) => !p.in_trash)
}

function extractTitle(page: NotionPage): string {
  const props = page.properties || {}
  for (const key of Object.keys(props)) {
    const p = props[key]
    if (p?.type === 'title' && Array.isArray(p.title)) {
      return p.title.map((t: any) => t.plain_text || '').join('').trim()
    }
  }
  return '(untitled)'
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bcopy\b/gi, '')
    .replace(/\brestored\b/gi, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const MAX_DEPTH = 3

/** Recursive body extraction + block count. Handles more block types than rich_text-only. */
async function fetchBodyText(pageId: string, depth = 0): Promise<{ text: string; blockCount: number }> {
  if (depth > MAX_DEPTH) return { text: '', blockCount: 0 }
  const parts: string[] = []
  let blockCount = 0
  let cursor: string | undefined
  while (true) {
    const qs = cursor ? `?start_cursor=${cursor}&page_size=100` : '?page_size=100'
    let res: any
    try {
      res = await notion(`/blocks/${pageId}/children${qs}`)
    } catch {
      return { text: parts.join('\n'), blockCount }
    }
    for (const block of res.results) {
      blockCount++
      const body = block?.[block.type]
      if (!body) continue

      // Primary: rich_text on most text blocks (paragraph, heading_*, bulleted_list_item, numbered_list_item,
      // quote, callout, toggle, to_do, code, table_row cells via rich_text array of arrays, etc.)
      const rt = body.rich_text
      if (Array.isArray(rt)) {
        parts.push(rt.map((r: any) => r.plain_text || '').join(''))
      }

      // table_row cells: array of arrays of rich_text
      if (block.type === 'table_row' && Array.isArray(body.cells)) {
        for (const cell of body.cells) {
          if (Array.isArray(cell)) parts.push(cell.map((r: any) => r.plain_text || '').join(' '))
        }
      }

      // child_page: has title field
      if (block.type === 'child_page' && typeof body.title === 'string') {
        parts.push(body.title)
      }

      // child_database
      if (block.type === 'child_database' && typeof body.title === 'string') {
        parts.push(body.title)
      }

      // image / file / video / pdf: caption rich_text + file URL/name
      if (['image', 'file', 'video', 'pdf'].includes(block.type)) {
        if (Array.isArray(body.caption)) parts.push(body.caption.map((r: any) => r.plain_text || '').join(''))
        const name = body.external?.url || body.file?.url || body.name
        if (typeof name === 'string') parts.push(name)
      }

      // bookmark / embed / link_preview: url + caption
      if (['bookmark', 'embed', 'link_preview'].includes(block.type)) {
        if (typeof body.url === 'string') parts.push(body.url)
        if (Array.isArray(body.caption)) parts.push(body.caption.map((r: any) => r.plain_text || '').join(''))
      }

      // Recurse into children blocks (toggle content, column/column_list, synced_block, table rows, etc.)
      if (block.has_children) {
        const child = await fetchBodyText(block.id, depth + 1)
        if (child.text) parts.push(child.text)
        blockCount += child.blockCount
      }
    }
    if (!res.has_more) break
    cursor = res.next_cursor
  }
  return { text: parts.join('\n').trim(), blockCount }
}

function shingles(text: string, k = SHINGLE_SIZE): Set<string> {
  const words = normalize(text).split(' ').filter(Boolean)
  const s = new Set<string>()
  if (words.length < k) {
    if (words.length) s.add(words.join(' '))
    return s
  }
  for (let i = 0; i <= words.length - k; i++) s.add(words.slice(i, i + k).join(' '))
  return s
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16)
}

/** Page is empty only if both its extracted text is tiny AND it has almost no blocks. */
function isEmpty(p: Enriched): boolean {
  return p.bodyLen < 20 && p.blockCount < 2
}

function cluster(pages: Enriched[]): Cluster[] {
  const clusters: Cluster[] = []
  const assigned = new Set<string>()

  // Pass 1: exact body-hash match (only if body is non-trivial)
  const byBody = new Map<string, Enriched[]>()
  for (const p of pages) {
    if (isEmpty(p)) continue
    const arr = byBody.get(p.bodyHash) || []
    arr.push(p)
    byBody.set(p.bodyHash, arr)
  }
  for (const [, group] of byBody) {
    if (group.length < 2) continue
    clusters.push({ id: clusters.length + 1, pages: group, confidence: 100, reason: 'identical body' })
    for (const p of group) assigned.add(p.id)
  }

  // Pass 2: normalized title match + body similarity
  const byTitle = new Map<string, Enriched[]>()
  for (const p of pages) {
    if (assigned.has(p.id)) continue
    if (!p.titleNorm || p.titleNorm.length < 3) continue
    const arr = byTitle.get(p.titleNorm) || []
    arr.push(p)
    byTitle.set(p.titleNorm, arr)
  }
  for (const [, group] of byTitle) {
    if (group.length < 2) continue
    // subdivide by body similarity
    const subs: Enriched[][] = []
    for (const p of group) {
      let placed = false
      for (const sub of subs) {
        const sim = jaccard(p.shingles, sub[0].shingles)
        if (sim >= SIM_THRESHOLD || (isEmpty(p) && isEmpty(sub[0]))) {
          sub.push(p)
          placed = true
          break
        }
      }
      if (!placed) subs.push([p])
    }
    for (const sub of subs) {
      if (sub.length < 2) continue
      const allEmpty = sub.every(isEmpty)
      const confidence = allEmpty ? 70 : 90
      const reason = allEmpty ? 'same title, empty bodies' : 'same title + similar body'
      clusters.push({ id: clusters.length + 1, pages: sub, confidence, reason })
      for (const p of sub) assigned.add(p.id)
    }
  }

  return clusters.sort((a, b) => b.pages.length - a.pages.length || b.confidence - a.confidence)
}

function pickKeep(group: Enriched[]): Enriched {
  // Prefer longest body; tie-break on most recent edit.
  return [...group].sort((a, b) => b.bodyLen - a.bodyLen || b.edited.localeCompare(a.edited))[0]
}

function csvEscape(v: string): string {
  if (v == null) return ''
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

async function main() {
  console.log('Enumerating workspace pages...')
  const pages = await enumeratePages()
  console.log(`Found ${pages.length} live pages. Fetching bodies (throttled)...`)

  const enriched: Enriched[] = []
  let done = 0
  const CONCURRENCY = 4
  const queue = [...pages]
  async function worker() {
    while (queue.length) {
      const p = queue.shift()!
      try {
        const title = extractTitle(p)
        const { text: body, blockCount } = await fetchBodyText(p.id)
        const titleNorm = normalize(title)
        enriched.push({
          id: p.id,
          url: p.url,
          title,
          titleNorm,
          bodyText: body,
          bodyHash: hash(normalize(body)),
          bodyLen: body.length,
          blockCount,
          shingles: shingles(body),
          created: p.created_time,
          edited: p.last_edited_time,
          parentType: p.parent?.type || '',
        })
      } catch (e: any) {
        console.warn(`\nskip ${p.id}: ${e.message}`)
      }
      done++
      if (done % 25 === 0) process.stdout.write(`\rFetched ${done}/${pages.length}...`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  process.stdout.write(`\rFetched ${done}/${pages.length}.\n`)

  console.log('Clustering...')
  const clusters = cluster(enriched)
  console.log(`Found ${clusters.length} duplicate clusters covering ${clusters.reduce((s, c) => s + c.pages.length, 0)} pages.`)

  const outDir = join('scripts', 'reports')
  mkdirSync(outDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

  // JSON
  const jsonPath = join(outDir, `dedupe-${ts}.json`)
  writeFileSync(
    jsonPath,
    JSON.stringify(
      clusters.map((c) => ({
        cluster: c.id,
        confidence: c.confidence,
        reason: c.reason,
        pages: c.pages.map((p) => ({
          id: p.id,
          title: p.title,
          url: p.url,
          bodyLen: p.bodyLen,
          created: p.created,
          edited: p.edited,
          parent: p.parentType,
        })),
      })),
      null,
      2,
    ),
  )

  // CSV
  const csvPath = join(outDir, `dedupe-${ts}.csv`)
  const rows = ['cluster,confidence,reason,role,title,url,body_len,created,edited,parent']
  for (const c of clusters) {
    const keep = pickKeep(c.pages)
    for (const p of c.pages) {
      const role = p.id === keep.id ? 'KEEP' : 'DELETE'
      rows.push(
        [
          c.id,
          c.confidence,
          csvEscape(c.reason),
          role,
          csvEscape(p.title),
          p.url,
          p.bodyLen,
          p.created,
          p.edited,
          p.parentType,
        ].join(','),
      )
    }
  }
  writeFileSync(csvPath, rows.join('\n'))

  console.log(`\nReport written:\n  ${csvPath}\n  ${jsonPath}`)
  console.log(`\nTop clusters:`)
  for (const c of clusters.slice(0, 10)) {
    console.log(`  [${c.confidence}%] ${c.pages.length}x — ${c.pages[0].title.slice(0, 60)} (${c.reason})`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
