const DEDUPLICATION_FOOTNOTE_PREFIX = "deduplication";
const DUPLICATE_FOOTNOTE_ID = `(?:${DEDUPLICATION_FOOTNOTE_PREFIX}-)?\\d+`;
const FOOTNOTE_DEF_REGEX = new RegExp(`\\[\\^(${DUPLICATE_FOOTNOTE_ID})\\^\\]: [^\\n]*\\d+% possible duplicate - [^\\n]+(\\n|$)`, "g");

export function createDuplicateFootnoteRef(index: number): string {
  return `[^${DEDUPLICATION_FOOTNOTE_PREFIX}-${index}^]`;
}

export function getHighestDuplicateFootnoteIndex(content: string): number {
  const footnotes = Array.from(content.matchAll(FOOTNOTE_DEF_REGEX));
  if (footnotes.length === 0) {
    return 0;
  }
  return Math.max(...footnotes.map((footnote) => Number(footnote[1].replace(`${DEDUPLICATION_FOOTNOTE_PREFIX}-`, ""))));
}

export function removeCautionMessages(content: string): string {
  const cautionRegex = />[!CAUTION]\n> This issue may be a duplicate of the following issues:\n((> - \[[^\]]+\]\([^)]+\)\n)+)/g;
  return content.replace(cautionRegex, "");
}

export function stripDuplicateFootnotes(content: string): string {
  const footnotes = content.match(FOOTNOTE_DEF_REGEX);
  let contentWithoutFootnotes = content.replace(FOOTNOTE_DEF_REGEX, "");
  if (footnotes) {
    footnotes.forEach((footnote) => {
      const footnoteId = footnote.match(new RegExp(`\\[\\^(${DUPLICATE_FOOTNOTE_ID})\\^\\]`))?.[1];
      if (!footnoteId) {
        return;
      }
      contentWithoutFootnotes = contentWithoutFootnotes.replace(new RegExp(`\\[\\^${footnoteId}\\^\\]`, "g"), "");
    });
  }
  return removeCautionMessages(contentWithoutFootnotes);
}
