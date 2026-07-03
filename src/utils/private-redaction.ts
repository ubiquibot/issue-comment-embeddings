import { PluginSettings } from "../types/plugin-input";

export function shouldRedactPrivateRepoContent(isPrivate: boolean, config: Pick<PluginSettings, "redactPrivateRepoComments">): boolean {
  return isPrivate && config.redactPrivateRepoComments === true;
}
