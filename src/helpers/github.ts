const GITHUB_HOST = "github.com";
const WWW_GITHUB_HOST = "www.github.com";

export function parseGitHubUrl(url: string) {
  const parsedUrl = new URL(url.trim());
  const hostname = parsedUrl.hostname.toLowerCase();
  const path = parsedUrl.pathname.replace(/\/+$/, "").split("/");
  const issueNumber = Number(path[4]);
  if (
    (hostname !== GITHUB_HOST && hostname !== WWW_GITHUB_HOST) ||
    path.length !== 5 ||
    (path[3] !== "issues" && path[3] !== "pull") ||
    !Number.isInteger(issueNumber)
  ) {
    throw new Error(`[parseGitHubUrl] Invalid url: [${url}]`);
  }
  return {
    owner: path[1],
    repo: path[2],
    issue_number: issueNumber,
  };
}

export function formatGitHubUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname !== GITHUB_HOST && hostname !== WWW_GITHUB_HOST) {
      return url;
    }
    parsedUrl.protocol = "https:";
    parsedUrl.hostname = WWW_GITHUB_HOST;
    parsedUrl.search = "";
    parsedUrl.hash = "";
    return parsedUrl.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

export function parseGitHubIssueCommentId(url: string): string | null {
  const match = url.trim().match(/#issuecomment-(\d+)\/*$/);
  return match?.[1] ?? null;
}
