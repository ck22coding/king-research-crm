// PDF report writer — measurement/pagination wrapper around `pdf-lib`.
// Why pdf-lib and not a flow engine: BUILD.md §F.

import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  TextAlignment,
  layoutMultilineText,
} from "pdf-lib";

export type FontName = "Helvetica" | "Helvetica-Bold";

export type FitVerdict = "fits" | "oversized" | "exhausted";

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = MARGIN;
const FULL_PAGE_CAPACITY = PAGE_HEIGHT - MARGIN - CONTENT_BOTTOM;
export const MAX_PAGES = 2; // hard cap — the spec's "never spill past 2 pages"

type TextOpts = { font?: FontName; size?: number };

// WinAnsi already covers the smart quotes/dashes news copy uses, so probe
// with the real font and fall back to '?' only for glyphs it can't draw.
function sanitize(font: PDFFont, text: string): string {
  try {
    font.widthOfTextAtSize(text, 10);
    return text;
  } catch {
    return Array.from(text)
      .map((ch) => {
        try {
          font.widthOfTextAtSize(ch, 10);
          return ch;
        } catch {
          return "?";
        }
      })
      .join("");
  }
}

// Builds an at-most-2-page PDF; writes past the cap are silently dropped.
export class PdfDoc {
  private page!: PDFPage;
  private y = 0;
  private pages = 0;
  private full = false;

  private constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: Record<FontName, PDFFont>,
  ) {}

  static async create(): Promise<PdfDoc> {
    const doc = await PDFDocument.create();
    const fonts: Record<FontName, PDFFont> = {
      Helvetica: await doc.embedFont(StandardFonts.Helvetica),
      "Helvetica-Bold": await doc.embedFont(StandardFonts.HelveticaBold),
    };
    const pdfDoc = new PdfDoc(doc, fonts);
    pdfDoc.newPage();
    return pdfDoc;
  }

  private newPage(): boolean {
    if (this.pages >= MAX_PAGES) return false;
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages += 1;
    this.y = PAGE_HEIGHT - MARGIN;
    return true;
  }

  // Exact glyph widths via pdf-lib's layout engine, not estimated.
  private measure(font: FontName, text: string, size: number): { lines: string[]; lineHeight: number } {
    const f = this.fonts[font];
    const layout = layoutMultilineText(sanitize(f, text) || " ", {
      alignment: TextAlignment.Left,
      fontSize: size,
      font: f,
      bounds: { x: 0, y: 0, width: CONTENT_WIDTH, height: 1_000_000 },
    });
    return { lines: layout.lines.map((l) => l.text), lineHeight: layout.lineHeight };
  }

  // "current": fits in the room left on this page as-is.
  // "fresh": doesn't fit here, but fits atomically on a brand-new page.
  // "oversized": bigger than a full page — no single page can hold it whole.
  private placement(needed: number): "current" | "fresh" | "oversized" {
    if (this.y - needed >= CONTENT_BOTTOM) return "current";
    if (needed <= FULL_PAGE_CAPACITY) return "fresh";
    return "oversized";
  }

  // "oversized": this block alone is bigger than a full page — skip just
  // this item and keep going. "exhausted": the 2-page budget is spent —
  // stop. Draws nothing either way.
  fitVerdict(text: string, { font = "Helvetica", size = 9 }: TextOpts = {}): FitVerdict {
    if (this.full) return "exhausted";
    const { lines, lineHeight } = this.measure(font, text, size);
    const verdict = this.placement(lines.length * lineHeight);
    if (verdict === "oversized") return "oversized";
    if (verdict === "current") return "fits";
    return this.pages < MAX_PAGES ? "fits" : "exhausted";
  }

  // Keeps a heading atomic with its first content line, so we never draw
  // an orphan heading with nothing beneath it. Draws nothing.
  fitsWithContent(heading: string, opts: TextOpts = {}): boolean {
    if (this.full) return false;
    const { font = "Helvetica", size = 9 } = opts;
    const { lines, lineHeight } = this.measure(font, heading, size);
    const contentLineHeight = this.measure("Helvetica", "x", 9).lineHeight;
    const verdict = this.placement(lines.length * lineHeight + contentLineHeight);
    if (verdict === "oversized") return false;
    return verdict === "current" || this.pages < MAX_PAGES;
  }

  // Places blocks atomically; an oversized paragraph is the one case that
  // must degrade line-by-line to hold the 2-page cap.
  text(text: string, { font = "Helvetica", size = 9 }: TextOpts = {}): boolean {
    if (this.full) return false;
    const { lines, lineHeight } = this.measure(font, text, size);
    const needed = lines.length * lineHeight;
    if (this.placement(needed) === "fresh" && (this.full || !this.newPage())) {
      this.full = true;
      return false;
    }
    const f = this.fonts[font];
    for (const line of lines) {
      if (this.y - lineHeight < CONTENT_BOTTOM) {
        if (this.full || !this.newPage()) {
          this.full = true;
          return false;
        }
      }
      this.y -= lineHeight;
      this.page.drawText(line, { x: MARGIN, y: this.y, size, font: f });
    }
    return true;
  }

  spacer(height: number) {
    this.y = Math.max(CONTENT_BOTTOM, this.y - height);
  }

  get pageCount(): number {
    return this.pages;
  }

  async toBytes(): Promise<Uint8Array> {
    return this.doc.save();
  }
}
