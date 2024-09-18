import { http, HttpResponse } from "msw";
import { db } from "./db";

const FAKE_DB_URL = "https://fymwbgfvpmbhkqzlpmfdr.supabase.co/rest/v1/content";
/**
 * Intercepts the routes and returns a custom payload
 */
export const handlers = [
  // get org repos
  http.get("https://api.github.com/orgs/:org/repos", ({ params: { org } }: { params: { org: string } }) =>
    HttpResponse.json(db.repo.findMany({ where: { owner: { login: { equals: org } } } }))
  ),
  // get org repo issues
  http.get("https://api.github.com/repos/:owner/:repo/issues", ({ params: { owner, repo } }) =>
    HttpResponse.json(db.issue.findMany({ where: { owner: { equals: owner as string }, repo: { equals: repo as string } } }))
  ),
  // get issue
  http.get("https://api.github.com/repos/:owner/:repo/issues/:issue_number", ({ params: { owner, repo, issue_number: issueNumber } }) =>
    HttpResponse.json(
      db.issue.findFirst({ where: { owner: { equals: owner as string }, repo: { equals: repo as string }, number: { equals: Number(issueNumber) } } })
    )
  ),
  // get user
  http.get("https://api.github.com/users/:username", ({ params: { username } }) =>
    HttpResponse.json(db.users.findFirst({ where: { login: { equals: username as string } } }))
  ),
  // get repo
  http.get("https://api.github.com/repos/:owner/:repo", ({ params: { owner, repo } }: { params: { owner: string; repo: string } }) => {
    const item = db.repo.findFirst({ where: { name: { equals: repo }, owner: { login: { equals: owner } } } });
    if (!item) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(item);
  }),
  // create comment
  http.post("https://api.github.com/repos/:owner/:repo/issues/:issue_number/comments", async ({ params: { issue_number: issueNumber }, request }) => {
    const { body } = await getValue(request.body);
    const id = db.issueComments.count() + 1;
    const newItem = { id, body, issue_number: Number(issueNumber), user: db.users.getAll()[0] };
    db.issueComments.create(newItem);
    return HttpResponse.json(newItem);
  }),
  // update comment
  http.patch("https://api.github.com/repos/:owner/:repo/issues/comments/:comment_id", async ({ params: { comment_id: commentId }, request }) => {
    const { body } = await getValue(request.body);
    const item = db.issueComments.findFirst({ where: { id: { equals: Number(commentId) } } });
    if (!item) {
      return new HttpResponse(null, { status: 404 });
    }
    item.body = body;
    return HttpResponse.json(item);
  }),
  // fake DB URL
  http.get(FAKE_DB_URL, async ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("source_id");
    const sourceId = query?.split(".")[1];

    const item = db.content.findMany({ where: { source_id: { equals: sourceId } } });
    if (!item || item.length === 0) {
      return new HttpResponse(null);
    }

    return HttpResponse.json(item[0]);
  }),
  // fake DB URL
  http.patch(FAKE_DB_URL, async () => {
    return HttpResponse.json({});
  }),
  // fake DB URL
  http.post(FAKE_DB_URL, async () => {
    return HttpResponse.json({});
  }),
  // fake DB URL
  http.delete(FAKE_DB_URL, async () => {
    return HttpResponse.json({});
  }),
  http.post("https://fymwbgfvpmbhkqzlpmfdr.supabase.co/rest/v1/rpc/find_similar_issues", async () => {
    return HttpResponse.json([]);
  }),
  http.post("https://api.voyageai.com/v1/embeddings", async () => {
    return HttpResponse.json({ data: [{ embedding: new Array(12).fill(0) }] });
  }),
];

async function getValue(body: ReadableStream<Uint8Array> | null) {
  if (body) {
    const reader = body.getReader();
    const streamResult = await reader.read();
    if (!streamResult.done) {
      const text = new TextDecoder().decode(streamResult.value);
      try {
        return JSON.parse(text);
      } catch (error) {
        console.error("Failed to parse body as JSON", error);
      }
    }
  }
}
