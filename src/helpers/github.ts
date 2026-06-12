export function parseGitHubUrl(url: string) {
  const normalizedUrl = url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
  const parsedUrl = new URL(normalizedUrl);
  if (parsedUrl.hostname !== "github.com" && parsedUrl.hostname !== "www.github.com") {
    throw new Error(`[parseGitHubUrl] Invalid url: [${url}]`);
  }
  const path = parsedUrl.pathname.replace(/\/$/, "").split("/");
  if (path.length !== 5) {
    throw new Error(`[parseGitHubUrl] Invalid url: [${url}]`);
  }
  return {
    owner: path[1],
    repo: path[2],
    issue_number: Number(path[4]),
  };
}
