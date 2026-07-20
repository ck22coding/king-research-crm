// Minimal, dependency-free PDF byte writer.
//
// Why hand-rolled instead of a library: the repo's PDF tooling (`~/.claude/skills/pdf`,
// `make-pdf`) is Python + a headless-browser/LaTeX pipeline meant for interactive
// Claude Code sessions, not something a Vercel serverless route can shell out to.
// The obvious JS alternative (puppeteer/playwright rendering HTML->PDF) means
// shipping a Chromium binary in a serverless function — the definition of a
// heavy new dependency for a report that's plain text with no images/charts.
// A report this simple (flowing headings + bullets, one standard font, 2-page
// cap) is one of the best-known "just write the PDF bytes" cases, so that's
// what this does: no new package, ~150 lines, valid output any PDF viewer opens.
//
// ponytail: no images, no embedded fonts (uses the 14 standard PDF fonts —
// Helvetica/Helvetica-Bold — so Latin-1 only), word-wrap by an estimated
// average glyph width rather than real font metrics. Upgrade to pdf-lib (or
// the skills above, called at build time instead of request time) if the
// report ever needs tables, charts, or exact typographic fit.

export type FontName = "Helvetica" | "Helvetica-Bold";

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = MARGIN;
const MAX_PAGES = 2; // hard cap — the spec's "never spill past 2 pages"

// The 14 standard PDF fonts only carry Latin-1 (WinAnsi-ish) glyphs. Rather
// than emit bytes that corrupt the string, normalize common "smart" chars
// news copy tends to use and drop anything else.
function sanitize(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x00-\xff]/g, "?");
}

function escapePdfString(text: string): string {
  return sanitize(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// Helvetica averages ~0.5em per character for mixed-case prose. 0.52 leans
// conservative (slightly shorter lines) so wrapped text doesn't visually run
// past the right margin for wide glyphs (M, W, m) — safe over exact.
const AVG_CHAR_WIDTH_EM = 0.52;

function wrapLine(text: string, fontSize: number, maxWidth: number): string[] {
  const maxChars = Math.max(10, Math.floor(maxWidth / (fontSize * AVG_CHAR_WIDTH_EM)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  lines.push(current);
  return lines.length ? lines : [""];
}

type TextOpts = { font?: FontName; size?: number; lineHeight?: number };

// Builds a flowing, at-most-2-page PDF: call `.text()`/`.spacer()` in the
// order content should appear; once page 2 runs out of vertical room, further
// writes are silently dropped (no 3rd page, ever) rather than overflowing.
export class PdfDoc {
  private pages: string[][] = [[]];
  private y = PAGE_HEIGHT - MARGIN;
  private full = false;

  private newPage(): boolean {
    if (this.pages.length >= MAX_PAGES) return false;
    this.pages.push([]);
    this.y = PAGE_HEIGHT - MARGIN;
    return true;
  }

  private writeLine(text: string, font: FontName, size: number, lineHeight: number): boolean {
    if (this.y - lineHeight < CONTENT_BOTTOM) {
      if (this.full || !this.newPage()) {
        this.full = true;
        return false;
      }
    }
    this.y -= lineHeight;
    const fontKey = font === "Helvetica-Bold" ? "F2" : "F1";
    this.pages[this.pages.length - 1].push(
      `BT 1 0 0 1 ${MARGIN} ${this.y.toFixed(1)} Tm /${fontKey} ${size} Tf (${escapePdfString(text)}) Tj ET`,
    );
    return true;
  }

  // Word-wraps and writes `text`; returns false once the page budget is gone
  // (callers don't need to check this — remaining sections just render empty
  // space, which is fine for a hard-capped report).
  text(text: string, { font = "Helvetica", size = 9, lineHeight = size * 1.4 }: TextOpts = {}): boolean {
    for (const line of wrapLine(text, size, CONTENT_WIDTH)) {
      if (!this.writeLine(line, font, size, lineHeight)) return false;
    }
    return true;
  }

  spacer(height: number) {
    this.y = Math.max(CONTENT_BOTTOM, this.y - height);
  }

  get pageCount() {
    return this.pages.length;
  }

  toBytes(): Buffer {
    const pageCount = this.pages.length;
    const fontF1Id = 3 + pageCount * 2;
    const fontF2Id = fontF1Id + 1;

    const objects: string[] = [];
    objects.push("<< /Type /Catalog /Pages 2 0 R >>");
    const kids = Array.from({ length: pageCount }, (_, i) => `${3 + i} 0 R`).join(" ");
    objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
    for (let i = 0; i < pageCount; i++) {
      const contentId = 3 + pageCount + i;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
          `/Resources << /Font << /F1 ${fontF1Id} 0 R /F2 ${fontF2Id} 0 R >> >> /Contents ${contentId} 0 R >>`,
      );
    }
    for (let i = 0; i < pageCount; i++) {
      const stream = this.pages[i].join("\n");
      objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    }
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

    let body = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((obj, idx) => {
      offsets.push(Buffer.byteLength(body, "latin1"));
      body += `${idx + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(body, "latin1");
    const total = objects.length + 1;
    let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
    body += xref;
    body += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(body, "latin1");
  }
}
