import { z } from 'zod'

export const DedupePageSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  url: z.string().url(),
  bodyLen: z.number().int().nonnegative(),
  blockCount: z.number().int().nonnegative().optional().default(0),
  imageCount: z.number().int().nonnegative().optional().default(0),
  fileCount: z.number().int().nonnegative().optional().default(0),
  embedCount: z.number().int().nonnegative().optional().default(0),
  created: z.string(),
  edited: z.string(),
  parent: z.string().optional().default(''),
})

export const DedupeClusterSchema = z.object({
  cluster: z.number().int().positive(),
  confidence: z.number().int().min(0).max(100),
  reason: z.string(),
  pages: z.array(DedupePageSchema).min(2),
})

export const DedupeReportSchema = z.array(DedupeClusterSchema)

export type DedupePage = z.infer<typeof DedupePageSchema>
export type DedupeCluster = z.infer<typeof DedupeClusterSchema>
export type DedupeReport = z.infer<typeof DedupeReportSchema>

export const DecisionSchema = z.object({
  status: z.enum(['archived', 'failed', 'skipped']),
  at: z.string(),
  error: z.string().optional(),
})
export const DecisionsSchema = z.record(z.string(), DecisionSchema)
export type Decision = z.infer<typeof DecisionSchema>
export type Decisions = z.infer<typeof DecisionsSchema>

/** Text + 500-char weight per media block, so media-only notes outrank blank text notes. */
export function effectiveSize(p: DedupePage): number {
  return p.bodyLen + 500 * ((p.imageCount ?? 0) + (p.fileCount ?? 0) + (p.embedCount ?? 0))
}

export function hasMedia(p: DedupePage): boolean {
  return (p.imageCount ?? 0) + (p.fileCount ?? 0) + (p.embedCount ?? 0) > 0
}

/** Returns the page id that should be marked KEEP: largest effective size, tiebreak most recent edit. */
export function pickKeepId(cluster: DedupeCluster): string {
  const sorted = [...cluster.pages].sort(
    (a, b) => effectiveSize(b) - effectiveSize(a) || b.edited.localeCompare(a.edited),
  )
  return sorted[0].id
}
