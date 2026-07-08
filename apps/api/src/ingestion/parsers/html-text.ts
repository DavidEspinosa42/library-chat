/**
 * Minimal HTML → plain text for ebook chapters (epub/mobi content is simple
 * XHTML). Block-level tags become newlines; entities are decoded for the
 * handful that matter in prose.
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|section|article)>/gi, "\n\n")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
  return normalizeWhitespace(text);
}

/** Split HTML into sections at each heading; the heading becomes the section title. */
export function splitHtmlSections(html: string): { title: string | null; text: string }[] {
  return html
    .split(/(?=<h[1-6][^>]*>)/i)
    .map((part) => ({ title: firstHeading(part), text: htmlToText(part) }))
    .filter((s) => s.text.length > 0);
}

/** First heading in a chapter's HTML, used as its section title. */
export function firstHeading(html: string): string | null {
  const m = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(html);
  if (!m?.[1]) return null;
  const title = normalizeWhitespace(m[1].replace(/<[^>]+>/g, " "));
  return title.length > 0 ? title.slice(0, 120) : null;
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
