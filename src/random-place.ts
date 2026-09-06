export function pickRandomPlace<T extends { id: number }>(
  places: T[],
  currentPlaceId: number | null,
  random: () => number = Math.random
): T | null {
  if (places.length === 0) return null;

  const candidates = places.length > 1 && currentPlaceId != null
    ? places.filter((place) => place.id !== currentPlaceId)
    : places;
  const index = Math.min(
    Math.floor(random() * candidates.length),
    candidates.length - 1
  );

  return candidates[index] ?? null;
}
