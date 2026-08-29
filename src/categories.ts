export type AppLocale = "ru" | "ja" | "en";

export const CATEGORIES = [
  { id: "nature", ru: "Природа и парки", ja: "自然・公園", en: "Nature & parks" },
  { id: "temple", ru: "Храмы и святилища", ja: "寺院・神社", en: "Temples & shrines" },
  { id: "museum", ru: "Музеи и галереи", ja: "博物館・美術館", en: "Museums & galleries" },
  { id: "food", ru: "Еда и напитки", ja: "飲食", en: "Food & drink" },
  { id: "architecture", ru: "Архитектура и история", ja: "建築・歴史", en: "Architecture & history" },
  { id: "neighborhood", ru: "Улицы и районы", ja: "街・地域", en: "Streets & neighborhoods" },
  { id: "entertainment", ru: "Развлечения", ja: "娯楽・テーマ施設", en: "Entertainment" },
  { id: "transport", ru: "Транспорт и станции", ja: "交通・駅", en: "Transport & stations" },
  { id: "shop", ru: "Магазины и мастерские", ja: "店・工房", en: "Shops & workshops" },
  { id: "animals", ru: "Животные и аквариумы", ja: "動物園・水族館", en: "Animals & aquariums" },
  { id: "bath", ru: "Онсэны и сэнто", ja: "温泉・銭湯", en: "Onsen & sento" },
  { id: "ruins", ru: "Руины и индустриальные места", ja: "廃墟・産業遺産", en: "Ruins & industrial sites" },
  { id: "cave", ru: "Пещеры и подземелья", ja: "洞窟・地下空間", en: "Caves & underground" },
  { id: "lodging", ru: "Отели и рёканы", ja: "ホテル・旅館", en: "Hotels & ryokan" },
  { id: "photo", ru: "Фото и студии", ja: "写真・スタジオ", en: "Photography & studios" },
  { id: "books", ru: "Книги и культурные пространства", ja: "本・文化施設", en: "Books & cultural spaces" },
  { id: "monument", ru: "Памятники и публичное искусство", ja: "記念碑・公共芸術", en: "Monuments & public art" },
  { id: "science", ru: "Наука и техника", ja: "科学・技術", en: "Science & technology" },
  { id: "other", ru: "Другое", ja: "その他", en: "Other" },
] as const;

const LEGACY_CATEGORY_MAP: Record<string, string> = {
  "Природа / парк": "nature", "Природа / смотровая": "nature",
  "Храм / святилище": "temple", "Храм / подземелье": "temple", "Пещера / священное место": "temple",
  "Музей": "museum", "Музей / галерея": "museum", "Музей / oddity": "museum", "Музей / архитектура": "museum", "Музей / индустриальное наследие": "museum",
  "Еда / напитки": "food", "Архитектура / историческое": "architecture", "Архитектура / искусство": "architecture",
  "Улица / район": "neighborhood", "Развлечения / тематическое": "entertainment", "Тематический парк": "entertainment", "Тематический парк / oddity": "entertainment",
  "Транспорт / станция": "transport", "Магазин": "shop", "Магазин / арт-пространство": "shop", "Магазин / мастерская": "shop",
  "Животные / аквариум": "animals", "Зоопарк / аквариум": "animals", "Онсэн / сэнто": "bath",
  "Руины / индустриальное": "ruins", "Руины / историческое": "ruins", "Городские руины / инфраструктура": "ruins", "Пещера / индустриальное": "ruins",
  "Пещера / подземелье": "cave", "Отель / рёкан": "lodging", "Фото / студия": "photo", "Фото / публичный объект": "monument",
  "Книги / культурное пространство": "books", "Библиотека / книги": "books", "История / памятник": "monument", "Наука / техника": "science", "Другое": "other",
};

export function normalizeCategory(value: string | null): string | null {
  if (!value) return null;
  return CATEGORIES.some((category) => category.id === value)
    ? value
    : LEGACY_CATEGORY_MAP[value] ?? "other";
}

export function categoryLabel(value: string | null, locale: AppLocale = "ru"): string {
  if (!value) return "";
  const id = normalizeCategory(value);
  const category = CATEGORIES.find((item) => item.id === id);
  return category?.[locale] ?? value;
}
