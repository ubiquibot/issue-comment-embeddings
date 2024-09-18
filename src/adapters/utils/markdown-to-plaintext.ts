import markdownit from "markdown-it";
import plainTextPlugin from "markdown-it-plain-text";

/**
 * Converts a Markdown string to plain text.
 * @param markdown
 * @returns
 */
export function markdownToPlainText(markdown?: string | null): string {
  if (!markdown) {
    return "";
  }
  const md = markdownit();
  md.use(plainTextPlugin);
  md.render(markdown);
  return (md as unknown as { plainText: string }).plainText;
}

export function htmlToPlainText(html: string): string {
  return html.replace(/<[^>]*>?/gm, "");
}
