import mammoth from "mammoth";

// pdfjs-dist (used internally by pdf-parse) references DOMMatrix/ImageData/Path2D
// at module load time. In serverless Node runtimes these DOM globals don't exist
// and there's no native canvas package installed, so the import crashes the
// whole function before any code runs. These are text-extraction-only stubs —
// just enough for the module to load; we never render, so fidelity doesn't matter.
const g = globalThis as unknown as Record<string, unknown>;

if (typeof g.DOMMatrix === "undefined") {
  g.DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(_init?: unknown) {}
    multiply() { return new (g.DOMMatrix as new () => unknown)(); }
    inverse() { return new (g.DOMMatrix as new () => unknown)(); }
    translate() { return new (g.DOMMatrix as new () => unknown)(); }
    scale() { return new (g.DOMMatrix as new () => unknown)(); }
  };
}

if (typeof g.ImageData === "undefined") {
  g.ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
      if (typeof dataOrWidth === "number") {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height ?? 0;
      }
    }
  };
}

if (typeof g.Path2D === "undefined") {
  g.Path2D = class Path2D {
    constructor(_path?: unknown) {}
    addPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    arc() {}
    arcTo() {}
    ellipse() {}
    rect() {}
  };
}

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
    const { PDFParse } = await import("pdf-parse");
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
