export const DEDUPLICATION_FOOTNOTE_PREFIX = "deduplication";
export const ANNOTATION_FOOTNOTE_PREFIX = "annotation";

const DUPLICATE_FOOTNOTE_DEF_REGEX = /\[\^([^\]]+)\]: [^\n]*\d+% possible duplicate - [^\n]+(\n|$)/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createFootnoteRef(prefix: string, index: number): string {
  return `[^${prefix}-${index}]`;
}

export function getHighestFootnoteIndex(content: string, prefix: string): number {
  const prefixedRefRegex = new RegExp(`\\[\\^${escapeRegExp(prefix)}-(\\d+)\\]`, "g");
  const legacyRefRegex = /\[\^(\d+)\^\]/g;
  const indexes: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = prefixedRefRegex.exec(content)) !== null) {
    indexes.push(Number.parseInt(match[1], 10));
  }
  while ((match = legacyRefRegex.exec(content)) !== null) {
    indexes.push(Number.parseInt(match[1], 10));
  }

  return indexes.length > 0 ? Math.max(...indexes) : 0;
}

export function getDuplicateFootnotes(content: string): RegExpMatchArray | null {
  return content.match(DUPLICATE_FOOTNOTE_DEF_REGEX);
}

export function removeCautionMessages(content: string): string {
  const cautionRegex = />[!CAUTION]\n> This issue may be a duplicate of the following issues:\n((> - \[[^\]]+\]\([^)]+\)\n)+)/g;
  return content.replace(cautionRegex, "");
}

export function stripDuplicateFootnotes(content: string): string {
  const footnotes = getDuplicateFootnotes(content);
  let contentWithoutFootnotes = content.replace(DUPLICATE_FOOTNOTE_DEF_REGEX, "");
  if (footnotes) {
    footnotes.forEach((footnote) => {
      const footnoteId = footnote.match(/^\[\^([^\]]+)\]:/)?.[1];
      if (!footnoteId) {
        return;
      }
      contentWithoutFootnotes = contentWithoutFootnotes.replace(new RegExp(`\\[\\^${escapeRegExp(footnoteId)}\\]`, "g"), "");
    });
  }
  return removeCautionMessages(contentWithoutFootnotes);
}
