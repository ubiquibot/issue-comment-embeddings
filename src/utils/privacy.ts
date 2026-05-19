import { PluginSettings } from "../types";

export function shouldRedactPrivateRepoContent(config: Pick<PluginSettings, "redactPrivateRepoComments">, isPrivate: boolean): boolean {
  return isPrivate && Boolean(config.redactPrivateRepoComments);
}
