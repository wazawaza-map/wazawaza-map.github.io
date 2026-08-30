import type { AppLocale } from "./categories";

export function visitedLabel(date: string | null, locale: AppLocale = "ru"): string {
  const label = { ru: "✓ Была здесь", ja: "✓ 訪問済み", en: "✓ Visited" }[locale];
  if (!date) return label;
  const match = /^(\d{4})-(\d{2})/.exec(date);
  return match ? `${label} · ${match[1]}/${match[2]}` : label;
}
