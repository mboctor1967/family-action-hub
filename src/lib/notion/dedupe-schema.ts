import { z } from 'zod'

export const DedupePageSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  url: z.string().url(),
  bodyLen: z.number().int().nonnegative(),
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

/** Returns the page id that should be marked KEEP for a cluster: longest body, tiebreak most recent edit. */
export function pickKeepId(cluster: DedupeCluster): string {
  const sorted = [...cluster.pages].sort(
    (a, b) => b.bodyLen - a.bodyLen || b.edited.localeCompare(a.edited),
  )
  return sorted[0].id
}
