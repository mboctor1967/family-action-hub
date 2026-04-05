const MIN_TEXT_LENGTH = 50

export interface PDFExtractResult {
  text: string
  pageCount: number
  isImagePDF: boolean
  extractionMethod: 'text' | 'ocr' | 'none'
}

/**
 * Extracts text from a PDF buffer.
 * First tries direct text extraction (fast).
 * If text is too short, falls back to OCR (slower but handles scanned PDFs).
 */
export async function extractTextFromPDF(
  buffer: Buffer,
  options: { enableOCR?: boolean } = {}
): Promise<PDFExtractResult> {
  // Step 1: Try direct text extraction
  try {
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>
    const data = await pdfParse(buffer)
    const text = data.text?.trim() || ''

    if (text.length >= MIN_TEXT_LENGTH) {
      return {
        text,
        pageCount: data.numpages || 0,
        isImagePDF: false,
        extractionMethod: 'text',
      }
    }

    // Text too short — likely an image PDF
    if (options.enableOCR) {
      return await tryOCR(buffer, data.numpages || 1)
    }

    return {
      text,
      pageCount: data.numpages || 0,
      isImagePDF: true,
      extractionMethod: 'none',
    }
  } catch (err: any) {
    // PDF parsing failed entirely — try OCR if enabled
    if (options.enableOCR) {
      return await tryOCR(buffer, 0)
    }

    return {
      text: '',
      pageCount: 0,
      isImagePDF: true,
      extractionMethod: 'none',
    }
  }
}

async function tryOCR(buffer: Buffer, pageCount: number): Promise<PDFExtractResult> {
  try {
    const { extractTextWithOCR } = await import('./ocr-extract')
    const result = await extractTextWithOCR(buffer)

    if (result.text.length >= MIN_TEXT_LENGTH) {
      return {
        text: result.text,
        pageCount: pageCount || result.pageCount,
        isImagePDF: true, // still an image PDF, just OCR'd
        extractionMethod: 'ocr',
      }
    }

    return {
      text: result.text,
      pageCount: pageCount || result.pageCount,
      isImagePDF: true,
      extractionMethod: 'none',
    }
  } catch {
    return {
      text: '',
      pageCount,
      isImagePDF: true,
      extractionMethod: 'none',
    }
  }
}
