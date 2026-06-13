const FOOTNOTE_REF_REGEX = /\[\^(?:[a-z-]+-)?(\d+)\^\]/g;

export function nextFootnoteIndex(content: string): number {
  const indexes = [...content.matchAll(FOOTNOTE_REF_REGEX)].map((match) => Number(match[1]));
  return indexes.length ? Math.max(...indexes) + 1 : 1;
}

export function createFootnoteRef(prefix: string, index: number): string {
  return `[^${prefix}-${index}^]`;
}

export function stripFootnoteRef(content: string, footnoteRef: string): string {
  return content.replaceAll(footnoteRef, "");
}
