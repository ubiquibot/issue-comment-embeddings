type RedactionConfig = {
  redactPrivateRepoComments?: boolean;
};

export function shouldRedactPrivateRepoContent(isPrivate: boolean, config: RedactionConfig): boolean {
  return isPrivate && config.redactPrivateRepoComments === true;
}
