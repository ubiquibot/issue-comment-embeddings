import { Octokit } from "@octokit/rest";
import { createClient } from "@supabase/supabase-js";
import { LogLevel, Logs } from "@ubiquity-os/ubiquity-os-logger";
import { VoyageAIClient } from "voyageai";
import { createAdapters } from "./adapters";
import { addComments } from "./handlers/add-comments";
import { addIssue } from "./handlers/add-issue";
import { deleteComment } from "./handlers/delete-comments";
import { deleteIssues } from "./handlers/delete-issue";
import { issueChecker } from "./handlers/issue-deduplication";
import { issueMatching } from "./handlers/issue-matching";
import { updateComment } from "./handlers/update-comments";
import { updateIssue } from "./handlers/update-issue";
import { Context, Env, PluginInputs } from "./types";
import { Database } from "./types/database";
import { isIssueCommentEvent, isIssueEvent } from "./types/typeguards";

/**
 * The main plugin function. Split for easier testing.
 */
export async function runPlugin(context: Context) {
  const { logger, eventName } = context;
  if (isIssueCommentEvent(context)) {
    switch (eventName) {
      case "issue_comment.created":
        return await addComments(context);
      case "issue_comment.deleted":
        return await deleteComment(context);
      case "issue_comment.edited":
        return await updateComment(context);
    }
  } else if (isIssueEvent(context)) {
    switch (eventName) {
      case "issues.opened":
        await issueChecker(context);
        await addIssue(context);
        return await issueMatching(context);
      case "issues.edited":
        await issueChecker(context);
        await updateIssue(context);
        return await issueMatching(context);
      case "issues.deleted":
        return await deleteIssues(context);
    }
  } else if (eventName == "issues.labeled") {
    return await issueMatching(context);
  } else {
    logger.error(`Unsupported event: ${eventName}`);
  }
  logger.ok(`Exiting plugin`);
}

/**
 * How a worker executes the plugin.
 */
export async function plugin(inputs: PluginInputs, env: Env) {
  const octokit = new Octokit({ auth: inputs.authToken });
  const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_KEY);
  const voyageClient = new VoyageAIClient({
    apiKey: env.VOYAGEAI_API_KEY,
  });
  const context: Context = {
    eventName: inputs.eventName,
    payload: inputs.eventPayload,
    config: inputs.settings,
    octokit,
    env,
    logger: new Logs("info" as LogLevel),
    adapters: {} as ReturnType<typeof createAdapters>,
  };
  context.adapters = createAdapters(supabase, voyageClient, context);
  return await runPlugin(context);
}
