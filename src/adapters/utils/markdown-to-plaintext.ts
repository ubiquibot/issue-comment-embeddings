import markdownit from "markdown-it";
import plainTextPlugin from "markdown-it-plain-text";

/**
 * Converts a Markdown string to plain text.
 * @param markdown
 * @returns
 */
export function markdownToPlainText(markdown?: string | null): string | null {
  if (!markdown) {
    return null;
  }
  const md = markdownit();
  md.use(plainTextPlugin);
  md.render(markdown);
  return (md as unknown as { plainText: string }).plainText;
}

export function htmlToPlainText(html: string | null): string | null {
  if (!html) {
    return null;
  }
  return html.replace(/<[^>]*>?/gm, "");
}
