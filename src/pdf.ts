import fs from "node:fs";
import * as mupdf from "mupdf";

export interface PageImage {
  pageNumber: number; // 1-based
  pngBuffer: Buffer;
}

/**
 * Extract plain text from every page of a PDF using mupdf.js
 * (the official Node/WASM binding for the same MuPDF engine PyMuPDF wraps).
 */
export function loadPdfText(filePath: string): { text: string; pageCount: number } {
  const buffer = fs.readFileSync(filePath);
  const doc = mupdf.Document.openDocument(buffer, "application/pdf");
  try {
    const pageCount = doc.countPages();
    const parts: string[] = [];
    for (let i = 0; i < pageCount; i++) {
      const page = doc.loadPage(i);
      try {
        const stext = page.toStructuredText("preserve-whitespace");
        try {
          parts.push(`\n--- Page ${i + 1} ---\n${stext.asText()}`);
        } finally {
          stext.destroy();
        }
      } finally {
        page.destroy();
      }
    }
    return { text: parts.join("\n"), pageCount };
  } finally {
    doc.destroy();
  }
}

/**
 * Render up to `maxPages` pages of a PDF to PNG images, for the `figures`
 * command's vision-based methodology-diagram search. 120 DPI keeps images
 * legible for a vision model without ballooning request size.
 */
export function renderPagesToPng(filePath: string, maxPages = 20, dpi = 120): PageImage[] {
  const buffer = fs.readFileSync(filePath);
  const doc = mupdf.Document.openDocument(buffer, "application/pdf");
  try {
    const pageCount = Math.min(doc.countPages(), maxPages);
    const images: PageImage[] = [];
    for (let i = 0; i < pageCount; i++) {
      const page = doc.loadPage(i);
      try {
        const pixmap = page.toPixmap(mupdf.Matrix.scale(dpi / 72, dpi / 72), mupdf.ColorSpace.DeviceRGB);
        try {
          images.push({ pageNumber: i + 1, pngBuffer: Buffer.from(pixmap.asPNG()) });
        } finally {
          pixmap.destroy();
        }
      } finally {
        page.destroy();
      }
    }
    return images;
  } finally {
    doc.destroy();
  }
}
