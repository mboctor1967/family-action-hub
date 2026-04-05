import Anthropic from '@anthropic-ai/sdk'
import { STATEMENT_PARSE_SYSTEM_PROMPT, getModelConfig } from './constants'
import type { ParsedStatement } from '@/types/financials'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export interface ParseResult {
  success: boolean
  data?: ParsedStatement
  error?: string
  modelUsed: string
  estimatedCost: number
  inputTokens: number
  outputTokens: number
}

/**
 * Sends extracted PDF text to Claude for structured JSON extraction.
 * Uses the configurable model (haiku for testing, sonnet for production).
 */
export async function parseStatementWithAI(text: string, fileName: string): Promise<ParseResult> {
  const { modelId, modelKey, costPerStatement } = getModelConfig()

  try {
    const message = await anthropic.messages.create({
      model: modelId,
      max_tokens: 8192,
      system: STATEMENT_PARSE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Parse this bank statement from file "${fileName}":\n\n${text}`,
        },
      ],
    })

    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : ''

    const inputTokens = message.usage?.input_tokens || 0
    const outputTokens = message.usage?.output_tokens || 0

    // Calculate actual cost based on token usage
    const costRates = {
      haiku: { input: 0.80, output: 4.0 },
      sonnet: { input: 3.0, output: 15.0 },
    }
    const rates = costRates[modelKey] || costRates.haiku
    const actualCost = (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000

    try {
      // Strip potential markdown wrapping
      const jsonStr = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()

      const parsed = JSON.parse(jsonStr) as ParsedStatement

      // Validate required fields
      if (!parsed.bank_name || !parsed.statement_start || !parsed.statement_end) {
        return {
          success: false,
          error: `Missing required fields in AI response (bank_name, statement_start, or statement_end)`,
          modelUsed: modelId,
          estimatedCost: actualCost,
          inputTokens,
          outputTokens,
        }
      }

      // Add row_index to each transaction
      if (parsed.transactions) {
        parsed.transactions = parsed.transactions.map((txn, idx) => ({
          ...txn,
          row_index: idx,
        }))
      }

      return {
        success: true,
        data: parsed,
        modelUsed: modelId,
        estimatedCost: actualCost,
        inputTokens,
        outputTokens,
      }
    } catch {
      return {
        success: false,
        error: `Failed to parse AI JSON response: ${responseText.substring(0, 200)}`,
        modelUsed: modelId,
        estimatedCost: actualCost,
        inputTokens,
        outputTokens,
      }
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Claude API error: ${err.message}`,
      modelUsed: modelId,
      estimatedCost: costPerStatement,
      inputTokens: 0,
      outputTokens: 0,
    }
  }
}
