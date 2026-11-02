/** Plain-text ranges for React highlighting; query text is never HTML or regex syntax. */
export function wikiSearchParts(text: string, query: string): { text: string; match: boolean; start: number }[] {
  // oxlint-disable-next-line unicorn/no-array-sort -- Sort a fresh array while retaining the project's ES target.
  const terms = [...new Set(query.trim().split(/\s+/).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!terms.length) return [{ text, match: false, start: 0 }];
  const pattern = new RegExp(terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "giu");
  const parts: { text: string; match: boolean; start: number }[] = [];
  let position = 0;
  for (const hit of text.matchAll(pattern)) {
    const index = hit.index;
    if (index > position) parts.push({ text: text.slice(position, index), match: false, start: position });
    parts.push({ text: hit[0], match: true, start: index });
    position = index + hit[0].length;
  }
  if (position < text.length) parts.push({ text: text.slice(position), match: false, start: position });
  return parts;
}
