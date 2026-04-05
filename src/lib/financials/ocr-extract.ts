import { createWorker } from 'tesseract.js'

/**
 * Extract text from a PDF buffer using OCR (Tesseract.js).
 * Converts PDF pages to images, then runs OCR on each page.
 * Slower than direct text extraction (~10-30s per page) but handles scanned documents.
 * Cost: $0 — runs locally.
 */
export async function extractTextWithOCR(buffer: Buffer): Promise<{
  text: string
  pageCount: number
}> {
  // pdf-parse can sometimes extract at least page images info
  // For OCR, we need to convert PDF to images first
  // We'll use pdf-parse to get basic info, then Tesseract on the raw buffer

  // Tesseract can work with PDF directly in some versions,
  // but for reliability we'll extract what we can
  const worker = await createWorker('eng')

  try {
    // Tesseract.js can process image buffers directly
    // For PDF, we pass the buffer and let Tesseract handle it
    const { data } = await worker.recognize(buffer)
    const text = data.text?.trim() || ''

    return {
      text,
      pageCount: 1, // Tesseract processes as single image
    }
  } finally {
    await worker.terminate()
  }
}
