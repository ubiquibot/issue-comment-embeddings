const FOOTNOTE_DEF_REGEX = /\[\^(?:deduplication-)?\d+\^\]: .*possible duplicate - [^\n]+(\n|$)/g;
const FOOTNOTE_REF_REGEX = /\[\^((?:deduplication-)?\d+)\^\]/;

export function removeCautionMessages(content: string): string {
  const cautionRegex = />[!CAUTION]\n> This issue may be a duplicate of the following issues:\n((> - \[[^\]]+\]\([^)]+\)\n)+)/g;
  return content.replace(cautionRegex, "");
}

export function stripDuplicateFootnotes(content: string): string {
  const footnotes = content.match(FOOTNOTE_DEF_REGEX);
  let contentWithoutFootnotes = content.replace(FOOTNOTE_DEF_REGEX, "");
  if (footnotes) {
    footnotes.forEach((footnote) => {
      const footnoteRef = footnote.match(FOOTNOTE_REF_REGEX)?.[1];
      if (!footnoteRef) {
        return;
      }
      contentWithoutFootnotes = contentWithoutFootnotes.replace(new RegExp(`\\[\\^${footnoteRef}\\^\\]`, "g"), "");
    });
  }
  return removeCautionMessages(contentWithoutFootnotes);
}
