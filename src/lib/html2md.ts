// StudyBoy — HTML → Markdown-ish converter for pasted rich content (OneNote,
// Word, browsers). Runs fully client-side via DOMParser (no deps).
//
// OneNote copies a fairly noisy HTML tree: lots of <div> line wrappers, inline
// style runs for bold/italic/underline/color, <h1..h6> or styled <p> for
// headings, <ul>/<ol>/<li>, and <table>. This walker reduces that to the
// markdown-ish dialect our RichText renderer understands:
//   #/##/### headings, **bold**, *italic*, ==highlight==, `code`, [t](url),
//   - / 1. lists, | tables |, ``` fenced code, $$ math passthrough, > quote.
//
// Unknown/unsupported tags fall back to their text content so nothing is lost.

type Ctx = { listDepth: number; inTable: boolean };

export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = block(doc.body, { listDepth: 0, inTable: false });
  return out.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim() + "\n";
}

// ── Block walker ──────────────────────────────────────────────────────
// Returns markdown for a node's children, grouping inline runs into
// paragraphs/lines and emitting block structure where tags demand it.
function block(node: Node, ctx: Ctx): string {
  let buf = "";
  let inlineRun = "";

  const flush = () => {
    if (inlineRun.trim()) {
      // Collapse runs of spaces/tabs but PRESERVE <br>-generated newlines.
      buf += inlineRun.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim() + "\n\n";
    }
    inlineRun = "";
  };

  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      inlineRun += child.textContent || "";
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as Element;
    const tag = el.tagName.toLowerCase();

    switch (tag) {
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": {
        flush();
        const level = Number(tag[1]);
        const prefix = "#".repeat(Math.min(level, 3)); // RichText only renders 1-3
        buf += `${prefix} ${inlineText(el, ctx).trim()}\n\n`;
        break;
      }
      case "p": {
        flush();
        // OneNote sometimes marks a <p> as a heading via inline style; keep as para.
        buf += `${inlineText(el, ctx).trim()}\n\n`;
        break;
      }
      case "br": {
        // hard line break inside a paragraph
        inlineRun += "\n";
        break;
      }
      case "div": {
        // OneNote wraps each line in a <div>. Emit as its own line.
        flush();
        const inner = block(el, ctx).trim();
        if (inner) buf += inner + "\n\n";
        break;
      }
      case "blockquote": {
        flush();
        const inner = block(el, ctx).trim();
        buf += inner.split("\n").map((l) => `> ${l}`).join("\n") + "\n\n";
        break;
      }
      case "pre": {
        flush();
        const code = el.textContent || "";
        const langClass = el.querySelector("code")?.className || "";
        const lang = (langClass.match(/language-(\w+)/) || [])[1] || "";
        buf += "```" + lang + "\n" + code.replace(/\n$/, "") + "\n```\n\n";
        break;
      }
      case "code": {
        // inline code if inline; block if it contains newlines
        const t = el.textContent || "";
        if (t.includes("\n")) {
          flush();
          buf += "```\n" + t.replace(/\n$/, "") + "\n```\n\n";
        } else {
          inlineRun += "`" + t + "`";
        }
        break;
      }
      case "ul": case "ol": {
        flush();
        buf += listBlock(el, tag === "ol", ctx) + "\n\n";
        break;
      }
      case "li": {
        // stray <li> outside a list — treat as bullet
        flush();
        buf += `- ${inlineText(el, ctx).trim()}\n`;
        break;
      }
      case "table": {
        flush();
        buf += tableBlock(el) + "\n\n";
        break;
      }
      case "hr": {
        flush();
        buf += "---\n\n";
        break;
      }
      case "img": {
        flush();
        const alt = (el.getAttribute("alt") || "[image]").trim();
        buf += `${alt}\n\n`;
        break;
      }
      case "style": case "script": case "meta": case "link": case "head":
        break;
      default: {
        // inline-ish element (span/b/i/u/a/sup/sub/font) — fold into run
        inlineRun += inlineText(el, ctx);
        break;
      }
    }
  });

  flush();
  return buf;
}

// ── List block ────────────────────────────────────────────────────────
function listBlock(el: Element, ordered: boolean, ctx: Ctx): string {
  const depth = ctx.listDepth;
  const indent = "  ".repeat(depth);
  let out = "";
  let i = 1;
  el.childNodes.forEach((child) => {
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const c = child as Element;
    if (c.tagName.toLowerCase() !== "li") return;
    const marker = ordered ? `${i}. ` : "- ";
    i++;
    // li content: inline text + nested lists, kept separate so nested-list
    // newlines/indentation aren't collapsed into the parent item's line.
    let inlineOnly = "";
    let nested = "";
    c.childNodes.forEach((gc) => {
      if (gc.nodeType === Node.ELEMENT_NODE) {
        const ge = gc as Element;
        const gt = ge.tagName.toLowerCase();
        if (gt === "ul" || gt === "ol") {
          nested += "\n" + listBlock(ge, gt === "ol", { ...ctx, listDepth: depth + 1 });
        } else {
          inlineOnly += inlineText(ge, ctx);
        }
      } else if (gc.nodeType === Node.TEXT_NODE) {
        inlineOnly += gc.textContent || "";
      }
    });
    inlineOnly = inlineOnly.replace(/\s+/g, " ").trim();
    out += `${indent}${marker}${inlineOnly}\n`;
    if (nested) out += nested.replace(/\n$/, "") + "\n";
  });
  return out.replace(/\n$/, "");
}

// ── Table block ───────────────────────────────────────────────────────
// Honors rowspan/colspan: builds a 2D grid, placing each cell at the next
// free column for its row and marking the covered (rowSpan × colSpan)
// rectangle as occupied so later rows skip those columns.
function tableBlock(el: Element): string {
  // Use HTMLTableElement.rows / HTMLTableRowElement.cells instead of
  // querySelectorAll('tr') / querySelectorAll('th,td'): the live `.rows`/`.cells`
  // collections only include THIS table's direct rows/cells and exclude rows/cells
  // belonging to nested <table>s, so a nested table is no longer merged into the
  // outer grid (its text still flows via the inline walker into the containing cell).
  const tbl = el as HTMLTableElement;
  const trs = Array.from(tbl.rows);
  if (!trs.length) return "";
  const grid: (string | null)[][] = [];
  const occupied: boolean[][] = []; // [row][col] claimed by a span
  const freeCol = (row: number): number => {
    occupied[row] ||= [];
    let c = 0;
    while (occupied[row][c]) c++;
    return c;
  };
  trs.forEach((tr, r) => {
    grid[r] ||= [];
    occupied[r] ||= [];
    let c = freeCol(r);
    Array.from((tr as HTMLTableRowElement).cells).forEach((cell) => {
      // advance past columns claimed by an earlier row's rowspan
      while (occupied[r][c]) c++;
      const colSpan = Math.max(1, Number(cell.getAttribute("colspan") || 1));
      const rowSpan = Math.max(1, Number(cell.getAttribute("rowspan") || 1));
      const txt = inlineText(cell, { listDepth: 0, inTable: true }).replace(/\s+/g, " ").trim();
      for (let rr = r; rr < r + rowSpan; rr++) {
        occupied[rr] ||= [];
        for (let cc = c; cc < c + colSpan; cc++) {
          occupied[rr][cc] = true;
          grid[rr] ||= [];
          if (rr === r) grid[rr][cc] = txt; // only write text in the originating row
        }
      }
      c += colSpan;
    });
  });
  const maxCols = Math.max(...grid.map((row) => row.length), 0);
  if (!maxCols) return "";
  const norm = grid.map((row) => {
    const out: string[] = [];
    for (let i = 0; i < maxCols; i++) out.push(row[i] ?? "");
    return out;
  });
  const header = norm[0];
  const body = norm.slice(1);
  const sep = "| " + header.map(() => "---").join(" | ") + " |";
  const lines: string[] = [];
  lines.push("| " + header.join(" | ") + " |");
  lines.push(sep);
  body.forEach((row) => lines.push("| " + row.join(" | ") + " |"));
  return lines.join("\n");
}

// ── Inline walker ─────────────────────────────────────────────────────
// Builds a markdown inline string from an element's descendants, mapping
// bold/italic/underline/highlight/code/link/strike to markdown syntax.
function inlineText(node: Node, ctx: Ctx): string {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += (child.textContent || "").replace(/ /g, " ");
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    const style = el.getAttribute("style") || "";
    let inner = inlineText(el, ctx);

    // style-based emphasis (OneNote favours inline styles over <b>/<i>)
    if (/(^|;)\s*font-weight\s*:\s*(bold|[6-9]00)/i.test(style) || tag === "b" || tag === "strong") {
      inner = inner.trim() ? `**${inner.trim()}**` : inner;
    }
    if (/(^|;)\s*font-style\s*:\s*italic/i.test(style) || tag === "i" || tag === "em") {
      inner = inner.trim() ? `*${inner.trim()}*` : inner;
    }
    if (/(^|;)\s*text-decoration[^;]*underline/i.test(style) || tag === "u") {
      // no underline in our dialect → wrap as bold-italic stand-in? keep raw, no markup
      // (RichText has no underline token; leaving plain preserves readability)
    }
    if (/(^|;)\s*text-decoration[^;]*line-through/i.test(style) || tag === "s" || tag === "strike" || tag === "del") {
      inner = inner.trim() ? `~~${inner.trim()}~~` : inner;
    }
    // OneNote highlight is often a yellow background on a <span>
    if (/background[^;]*(yellow|#(?:ffff|ffe0|ff0))/i.test(style)) {
      inner = inner.trim() ? `==${inner.trim()}==` : inner;
    }

    switch (tag) {
      case "br":
        out += "\n";
        break;
      case "a": {
        const href = el.getAttribute("href") || "";
        const text = inner.trim() || href;
        out += href ? `[${text}](${href})` : text;
        break;
      }
      case "code":
        out += "`" + (el.textContent || "") + "`";
        break;
      case "sup":
        out += `^(${inner.trim()})`;
        break;
      case "sub":
        out += `~(${inner.trim()})`;
        break;
      case "img": {
        const alt = (el.getAttribute("alt") || "").trim();
        if (alt) out += alt;
        break;
      }
      case "span": case "font": case "b": case "strong": case "i": case "em":
      case "u": case "s": case "strike": case "del": case "mark":
        out += inner;
        break;
      default:
        out += inner;
    }
  });
  return out;
}