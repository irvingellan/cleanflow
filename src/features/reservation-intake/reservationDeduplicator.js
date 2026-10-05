export function possibleDuplicates(candidate, candidates) {
  // Correlation is review evidence only, never a merge or equality proof.
  return candidates.filter(other => other.id !== candidate.id && other.sourceId !== candidate.sourceId
    && candidate.checkIn && candidate.checkOut && other.checkIn === candidate.checkIn && other.checkOut === candidate.checkOut
    && ((candidate.propertyMappingCandidateId && other.propertyMappingCandidateId === candidate.propertyMappingCandidateId)
      || (candidate.sourceListingExternalId && other.sourceListingExternalId === candidate.sourceListingExternalId)))
    .map(other => other.id);
}
