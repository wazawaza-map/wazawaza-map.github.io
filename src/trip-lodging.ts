import type { TripDay } from "./trip-types";

export function lodgingSourceDay(day: TripDay, days: TripDay[]): TripDay {
  const visited = new Set<number>();
  let current = day;
  while (current.lodging_source_day_id && !visited.has(current.id)) {
    visited.add(current.id);
    const source = days.find((candidate) => candidate.id === current.lodging_source_day_id);
    if (!source) break;
    current = source;
  }
  return current;
}

export function lodgingNightCount(day: TripDay, days: TripDay[]): number {
  const index = days.indexOf(day);
  if (index < 0) return 1;
  let count = 1;
  for (let offset = index + 1; offset < days.length; offset += 1) {
    if (days[offset].lodging_source_day_id !== day.id) break;
    count += 1;
  }
  return count;
}

export function hasLodging(day: TripDay): boolean {
  return Boolean(day.destination_id || day.overnight_city || day.lodging_name || day.lodging_url || day.lodging_status);
}
