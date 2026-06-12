export function shouldRedactPrivateRepoContent(isPrivate: boolean, redactPrivateRepoComments: boolean): boolean {
  return isPrivate && redactPrivateRepoComments;
}
