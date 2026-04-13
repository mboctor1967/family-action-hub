const NOTION_API = 'https://api.notion.com/v1'

export type ArchiveResult = {
  pageId: string
  status: 'archived' | 'failed'
  error?: string
}

async function patchArchived(pageId: string, token: string): Promise<Response> {
  return fetch(`${NOTION_API}/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ archived: true }),
  })
}

export async function archivePage(pageId: string, token: string): Promise<ArchiveResult> {
  try {
    let res = await patchArchived(pageId, token)
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') || '1')
      await new Promise((r) => setTimeout(r, Math.min(10_000, retryAfter * 1000)))
      res = await patchArchived(pageId, token)
    }
    if (!res.ok) {
      const text = await res.text()
      const hint =
        res.status === 403
          ? 'Token lacks Update content scope. Check Notion integration settings.'
          : res.status === 404
          ? 'Page not found (already deleted?)'
          : `HTTP ${res.status}`
      return { pageId, status: 'failed', error: `${hint}: ${text.slice(0, 200)}` }
    }
    return { pageId, status: 'archived' }
  } catch (e: any) {
    return { pageId, status: 'failed', error: e?.message || 'network error' }
  }
}

export async function archiveBatch(
  pageIds: string[],
  token: string,
  concurrency = 4,
): Promise<ArchiveResult[]> {
  const results: ArchiveResult[] = []
  const queue = [...pageIds]
  async function worker() {
    while (queue.length) {
      const id = queue.shift()!
      results.push(await archivePage(id, token))
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}
