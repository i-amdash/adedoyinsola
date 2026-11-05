// A small, dependency-free PDF writer for the project brief. It runs in the browser (the
// "Download PDF" button) and on the server (attached to the notification email), so both
// produce exactly the same document. It uses the built-in Helvetica fonts, so text is
// limited to Latin-1; anything else is transliterated or replaced.

import { formatMoney } from "./builder.mjs";

// Helvetica advance widths for characters 32–126 (per 1000 units).
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const SWAP = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", "•": "-", "₦": "NGN ", "→": "->", "×": "x", "✓": "" };

/** Make text safe for a WinAnsi Helvetica string. */
export function pdfText(value) {
  let out = "";
  for (const ch of String(value ?? "").normalize("NFC")) {
    const swap = SWAP[ch];
    if (swap !== undefined) out += swap;
    else {
      const code = ch.codePointAt(0);
      if (code === 9 || code === 10) out += " ";
      else if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) out += ch;
      else if (ch.normalize("NFD")[0].codePointAt(0) < 127) out += ch.normalize("NFD")[0];
      else out += "?";
    }
  }
  return out;
}
const textWidth = (s, size, bold) => {
  let w = 0;
  for (const ch of s) w += HELVETICA[ch.charCodeAt(0) - 32] ?? 556;
  return (w * size * (bold ? 1.06 : 1)) / 1000;
};
function wrap(s, size, max, bold) {
  const lines = [];
  for (const para of pdfText(s).split(/\s*\n\s*/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (textWidth(next, size, bold) <= max || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
      // Very long words (URLs) are hard-broken.
      while (textWidth(line, size, bold) > max && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && textWidth(line.slice(0, cut), size, bold) > max) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}
const esc = (s) => s.replace(/[\\()]/g, (c) => "\\" + c);
const rgb = (hex) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
export const pdfMoney = (n) => pdfText(formatMoney(n, "NGN"));

/**
 * @param {{ reference: string, createdAt: string, productName: string, tagline?: string,
 *   estimate: { low: number, high: number, weeks: [number, number], monthly: number, lines: {label: string, amount: number}[] },
 *   summary: [string, string][], contact?: { name?: string, email?: string, phone?: string, company?: string, notes?: string },
 *   usdRate?: number, owner?: { name?: string, email?: string } }} brief
 * @returns {Uint8Array}
 */
export function briefPdf(brief) {
  const W = 595,
    H = 842,
    M = 48;
  const pages = [];
  let ops = [],
    y = 0;
  const text = (s, x, yy, size = 10, { bold = false, color = "#1d2a24", align = "left" } = {}) => {
    const t = pdfText(s);
    const dx = align === "right" ? x - textWidth(t, size, bold) : x;
    ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${rgb(color)} rg ${dx.toFixed(2)} ${yy.toFixed(2)} Td (${esc(t)}) Tj ET`);
  };
  const rect = (x, yy, w, h, color) => ops.push(`${rgb(color)} rg ${x} ${yy.toFixed(2)} ${w} ${h.toFixed(2)} re f`);
  const rule = (yy, color = "#d9ddd2") => ops.push(`${rgb(color)} RG 0.6 w ${M} ${yy.toFixed(2)} m ${W - M} ${yy.toFixed(2)} l S`);
  const footer = () => {
    text(`${pdfText(brief.owner?.name || "Adedoyinsola")} · Project brief ${brief.reference}`.replace("·", "-"), M, 28, 8, { color: "#7b857a" });
    text(`Page ${pages.length + 1}`, W - M, 28, 8, { color: "#7b857a", align: "right" });
  };
  const newPage = () => {
    if (ops.length) {
      footer();
      pages.push(ops.join("\n"));
    }
    ops = [];
    y = H - M;
  };
  const room = (h) => {
    if (y - h < 60) newPage();
  };
  const heading = (s) => {
    room(44);
    y -= 14;
    text(s.toUpperCase(), M, y, 8.5, { bold: true, color: "#486a33" });
    y -= 8;
    rule(y);
    y -= 16;
  };

  // Header band
  newPage();
  rect(0, H - 150, W, 150, "#17221e");
  text("PROJECT BRIEF", M, H - 52, 8.5, { bold: true, color: "#c5ed8b" });
  text(brief.productName, M, H - 84, 24, { bold: true, color: "#f4f2e9" });
  if (brief.tagline) text(brief.tagline, M, H - 106, 10, { color: "#a5ada2" });
  text(`Reference ${brief.reference}`, W - M, H - 52, 9, { bold: true, color: "#f4f2e9", align: "right" });
  const date = new Date(brief.createdAt);
  text(Number.isNaN(+date) ? "" : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), W - M, H - 66, 9, { color: "#a5ada2", align: "right" });
  y = H - 150 - 30;

  // Estimate block
  const e = brief.estimate;
  rect(M, y - 74, W - 2 * M, 84, "#eef3e4");
  text("ESTIMATED INVESTMENT", M + 16, y - 10, 8, { bold: true, color: "#486a33" });
  text(`${pdfMoney(e.low)} - ${pdfMoney(e.high).replace("NGN ", "")}`, M + 16, y - 38, 22, { bold: true });
  if (brief.usdRate) text(`About ${formatMoney(e.low, "USD", brief.usdRate)} - ${formatMoney(e.high, "USD", brief.usdRate)}`, M + 16, y - 56, 9, { color: "#5c6a5c" });
  text("TIMELINE", W - M - 150, y - 10, 8, { bold: true, color: "#486a33" });
  text(`${e.weeks[0]}-${e.weeks[1]} weeks`, W - M - 150, y - 34, 15, { bold: true });
  if (e.monthly) text(`+ ${pdfMoney(e.monthly)} / month after launch`, W - M - 150, y - 52, 9, { color: "#5c6a5c" });
  y -= 100;

  // Answers
  heading("What you asked for");
  const labelW = 190,
    valueX = M + labelW + 14,
    valueW = W - M - valueX;
  for (const [label, value] of brief.summary) {
    const left = wrap(label, 9, labelW, false),
      right = wrap(value, 10, valueW, true);
    const h = Math.max(left.length * 12, right.length * 13) + 8;
    room(h);
    left.forEach((l, i) => text(l, M, y - i * 12, 9, { color: "#6b776b" }));
    right.forEach((l, i) => text(l, valueX, y - i * 13, 10, { bold: true }));
    y -= h;
  }

  // Breakdown
  heading("How the estimate adds up");
  for (const line of e.lines) {
    const rows = wrap(line.label, 10, W - 2 * M - 120, false);
    room(rows.length * 13 + 6);
    rows.forEach((l, i) => text(l, M, y - i * 13, 10));
    text(pdfMoney(line.amount), W - M, y, 10, { bold: true, align: "right" });
    y -= rows.length * 13 + 6;
  }
  room(30);
  rule(y + 4, "#1d2a24");
  y -= 12;
  text("Estimate range", M, y, 10, { bold: true });
  text(`${pdfMoney(e.low)} - ${pdfMoney(e.high).replace("NGN ", "")}`, W - M, y, 10, { bold: true, align: "right" });
  y -= 20;

  // Contact
  const c = brief.contact || {};
  const contact = [
    ["Name", c.name],
    ["Company", c.company],
    ["Email", c.email],
    ["Phone / WhatsApp", c.phone],
    ["Notes", c.notes],
  ].filter(([, v]) => v);
  if (contact.length) {
    heading("Contact");
    for (const [label, value] of contact) {
      const rows = wrap(value, 10, valueW, false);
      room(rows.length * 13 + 8);
      text(label, M, y, 9, { color: "#6b776b" });
      rows.forEach((l, i) => text(l, valueX, y - i * 13, 10));
      y -= rows.length * 13 + 8;
    }
  }

  // Note
  const note = wrap(
    "This is an estimate based on your answers, not a fixed quote. Prices are in Nigerian naira; the dollar figure is a guide only. After a short call to confirm the details you will get a fixed price and a project plan.",
    9,
    W - 2 * M,
    false,
  );
  room(note.length * 12 + 40);
  y -= 10;
  note.forEach((l, i) => text(l, M, y - i * 12, 9, { color: "#6b776b" }));
  y -= note.length * 12 + 10;
  if (brief.owner?.email) text(`Questions? ${brief.owner.email}`, M, y, 9, { bold: true, color: "#486a33" });
  newPage();

  // Assemble the file.
  const objects = [];
  const add = (body) => objects.push(body) && objects.length;
  const catalog = add("");
  const tree = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids = [];
  for (const stream of pages) {
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objects[tree - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
