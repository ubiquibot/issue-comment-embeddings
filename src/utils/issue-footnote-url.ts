export function buildIssueFootnoteUrl(issueUrl: string, issueNumber: number | string): string {
  try {
    const url = new URL(issueUrl);
    if (url.hostname === "github.com") {
      url.hostname = "www.github.com";
    }
    url.search = "";
    url.hash = `#${issueNumber}`;
    return url.toString();
  } catch {
    const [withoutHash] = issueUrl.split("#");
    const [withoutQuery] = withoutHash.split("?");
    return `${withoutQuery.replace("https://github.com", "https://www.github.com")}#${issueNumber}`;
  }
}
