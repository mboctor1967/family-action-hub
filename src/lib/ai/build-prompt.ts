import { readFileSync } from 'fs'
import { join } from 'path'

export function buildClassificationPrompt(): string {
  const configPath = join(process.cwd(), 'config', 'classification.json')
  const config = JSON.parse(readFileSync(configPath, 'utf-8'))

  const noiseSenders = config.noise_senders.map((s: string) => `- ${s}`).join('\n')
  const noisePatterns = config.noise_sender_patterns.map((s: string) => `- ${s}`).join('\n')
  const notActionable = config.not_actionable_examples.map((s: string) => `- ${s}`).join('\n')

  const highPriorityRules = config.high_priority_rules
    .map((r: any) => `- ${r.match} -> ${r.topic}, ${r.priority} priority, assign to ${r.assignee}`)
    .join('\n')

  const members = config.family_context.members
    .map((m: any) => `- ${m.name} (${m.role}) - handles ${m.handles}`)
    .join('\n')

  // Include user feedback rules if any real ones exist
  const feedbackRules = config.user_feedback_rules
    .filter((r: any) => typeof r === 'object')
  const feedbackSection = feedbackRules.length > 0
    ? `\nUSER FEEDBACK RULES (learned from corrections - follow these strictly):\n${feedbackRules.map((r: any) => {
        if (r.corrected_to) {
          return `- Emails from "${r.sender}" like "${r.subject_pattern}" are NOT actionable (${r.learned})`
        }
        return `- Emails from "${r.sender}" like "${r.subject_pattern}" ARE actionable (confirmed)`
      }).join('\n')}`
    : ''

  return `You are an email triage assistant for the Boctor family. Be STRICT about what counts as "actionable" — when in doubt, classify as informational or noise.

CLASSIFICATION RULES:
- "actionable" = ${config.classification_definitions.actionable}
- "informational" = ${config.classification_definitions.informational}
- "noise" = ${config.classification_definitions.noise}

CRITICAL: These are NOT actionable (classify as informational or noise):
${notActionable}

KNOWN NOISE SENDERS (always classify as noise):
${noiseSenders}

NOISE SENDER PATTERNS:
${noisePatterns}

KNOWN HIGH PRIORITY PATTERNS (these ARE actionable):
${highPriorityRules}

FAMILY CONTEXT:
${members}
${config.family_context.notes}
${feedbackSection}

For each actionable email, extract:
1. A 1-2 sentence action summary (what specifically needs to be done)
2. Suggested assignee (Maged or Mandy based on content)
3. Suggested topic folder
4. Urgency level (urgent/high/medium/low)
5. Due date if mentioned or inferable
6. Brief reasoning for classification`
}
