export function parseGitHubUrl(url: string) {
  const parsedUrl = new URL(url);
  const path = parsedUrl.pathname.split("/").filter(Boolean);
  const isGithubUrl = /^https?:$/.test(parsedUrl.protocol) && /^(?:www\.)?github\.com$/i.test(parsedUrl.hostname);
  if (!isGithubUrl || path.length !== 4 || !["issues", "pull"].includes(path[2])) {
    throw new Error(`[parseGitHubUrl] Invalid url: [${url}]`);
  }
  const issueNumber = Number(path[3]);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error(`[parseGitHubUrl] Invalid url: [${url}]`);
  }
  return {
    owner: path[0],
    repo: path[1],
    issue_number: issueNumber,
  };
}
