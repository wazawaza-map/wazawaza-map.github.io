import type { AppLocale } from "./categories";

// IDs are stored in places.tags. Labels can change without changing saved places.
export const TAGS = [
  { id: "kaidan-meguri", ru: "Кайдан-мэгури · проход во тьме", ja: "戒壇巡り", en: "Kaidan meguri · dark passage" },
  { id: "anime", ru: "Аниме и манга", ja: "アニメ・漫画", en: "Anime & manga" },
  { id: "work-golden-kamuy", ru: "Golden Kamuy", ja: "ゴールデンカムイ", en: "Golden Kamuy" },
  { id: "work-haikyu", ru: "Haikyu!!", ja: "ハイキュー!!", en: "Haikyu!!" },
] as const;

const ALIASES: Record<string, string> = {
  "戒壇巡り": "kaidan-meguri", "戒壇めぐり": "kaidan-meguri", "お戒壇巡り": "kaidan-meguri",
  "お戒壇めぐり": "kaidan-meguri",
};

export function normalizeTag(id: string): string { return ALIASES[id] ?? id; }
export function tagLabel(id: string, locale: AppLocale): string {
  return TAGS.find(tag => tag.id === normalizeTag(id))?.[locale] ?? id;
}
export function knownTagIds(tags: readonly string[] = []): string[] {
  return [...new Set(tags.map(normalizeTag))].filter(id => TAGS.some(tag => tag.id === id));
}
// Uncatalogued legacy tags must not disappear when an editor saves a place.
export function mergePlaceTags(previous: readonly string[], selected: readonly string[]): string[] {
  return [...new Set([...previous.filter(id => !knownTagIds([id]).length), ...knownTagIds(selected)])];
}

export function tagFilterCopy(locale: AppLocale) {
  return locale === "ja" ? { title: "タグ", all: "すべてのタグ" }
    : locale === "en" ? { title: "Tag", all: "All tags" }
    : { title: "Тег", all: "Все теги" };
}
