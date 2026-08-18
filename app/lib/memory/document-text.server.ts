import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const LEGACY_DOC_MIME = "application/msword";

export function isSupportedDocumentFile(filename: string, mimeType: string): boolean {
  const lower = filename.toLowerCase();
  if (mimeType.startsWith("text/")) return true;
  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) return true;
  if (mimeType === DOCX_MIME || lower.endsWith(".docx")) return true;
  return [".txt", ".md", ".csv"].some((ext) => lower.endsWith(ext));
}

/**
 * Extracts plain text for embedding. PDFs and .docx go through dedicated
 * parsers; everything else is treated as UTF-8 text. Legacy .doc (pre-2007
 * binary Word format) is explicitly rejected — reliable extraction needs a
 * much heavier library than this app otherwise depends on.
 */
export async function extractDocumentText(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const lower = filename.toLowerCase();

  if (mimeType === LEGACY_DOC_MIME || lower.endsWith(".doc")) {
    throw new Error("Legacy .doc files aren't supported — please save as .docx and re-upload.");
  }

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  if (mimeType === DOCX_MIME || lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  return buffer.toString("utf-8");
}
