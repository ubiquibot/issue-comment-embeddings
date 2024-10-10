import { Octokit } from "@octokit/rest";
import { EmitterWebhookEvent as WebhookEvent, EmitterWebhookEventName as WebhookEventName } from "@octokit/webhooks";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import { createAdapters } from "../adapters";
import { Env } from "./env";
import { PluginSettings } from "./plugin-inputs";

/**
 * Update `manifest.json` with any events you want to support like so:
 *
 * ubiquity:listeners: ["issue_comment.created", ...]
 */
export type SupportedEventsU =
  | "issue_comment.created"
  | "issue_comment.deleted"
  | "issue_comment.edited"
  | "issues.opened"
  | "issues.edited"
  | "issues.deleted"
  | "issues.labeled";

export type SupportedEvents = {
  [K in SupportedEventsU]: K extends WebhookEventName ? WebhookEvent<K> : never;
};

export interface Context<T extends SupportedEventsU = SupportedEventsU, TU extends SupportedEvents[T] = SupportedEvents[T]> {
  eventName: T;
  payload: TU["payload"];
  octokit: InstanceType<typeof Octokit>;
  config: PluginSettings;
  env: Env;
  logger: Logs;
  adapters: ReturnType<typeof createAdapters>;
}
