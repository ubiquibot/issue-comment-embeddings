type RepositoryContext = {
  owner: {
    login: string;
  };
  name: string;
};

const SAME_ORGANIZATION_DISCOUNT = 0.25;
const GLOBAL_DISCOUNT = 0.5;

export function getRepositoryContextAdjustedSimilarity(similarity: number, currentRepository: RepositoryContext, similarRepository: RepositoryContext): number {
  const currentOwner = currentRepository.owner.login.toLowerCase();
  const similarOwner = similarRepository.owner.login.toLowerCase();
  const currentName = currentRepository.name.toLowerCase();
  const similarName = similarRepository.name.toLowerCase();

  if (currentOwner === similarOwner && currentName === similarName) {
    return similarity;
  }

  const discount = currentOwner === similarOwner ? SAME_ORGANIZATION_DISCOUNT : GLOBAL_DISCOUNT;

  return Math.max(0, similarity - discount);
}
