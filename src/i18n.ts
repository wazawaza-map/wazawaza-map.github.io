import type { AppLocale } from "./categories";

const COPY = {
  ru: {
    heroTitle: "Места, ради которых<br>стоит свернуть с маршрута.", heroLead: "Не “топ-10 Токио”, а странное, красивое, далёкое и очень конкретное.", loading: "Загружаю опубликованные места…",
    statsLabel: "Статистика", publishedPlaces: "мест опубликовано", prefectures: "префектур", routes: "маршрутов",
    databaseEmptyTitle: "Связь есть. Публикаций пока нет.", databaseEmptyText: "Все места сейчас остаются в статусе draft.",
    search: "Поиск", searchPlaceholder: "Название, тег, город или станция", clearSearch: "Очистить поиск", prefecture: "Префектура", allPrefectures: "Все",
    category: "Категория", allCategories: "Все категории", visit: "Посещение", allPlaces: "Все места", visitedOnly: "Только была", unvisitedOnly: "Только не была",
    adjacent: "Показывать соседние префектуры", resetFilters: "Сбросить фильтры", matchingFilters: "соответствуют фильтрам", visibleOnMap: "видно на карте",
    nothingFound: "НИЧЕГО НЕ НАШЛОСЬ", changeSearch: "Попробуйте изменить поиск.", changeSearchHint: "Можно очистить запрос, выбрать другую префектуру или отдалить карту.",
    noMatches: "По вашему запросу ничего не найдено.", noMatchesHint: "Очистите поиск или выберите другую префектуру.", noPlacesInView: "В этом фрагменте карты мест нет.", noPlacesInViewHint: "Отдалите карту или переместитесь в другую область.",
    unnamed: "Без названия", place: "Место", descriptionSoon: "Описание скоро появится.", openPlace: "Открыть", transitWalk: "мин от транспорта", close: "Закрыть",
    whyInteresting: "Почему интересно", time: "Время", fromStation: "От станции", environment: "Среда", nearestStation: "Ближайшая станция", directions: "Как добраться", hoursAndSeason: "Часы и сезон", price: "Цена", reservation: "Бронирование",
    openMaps: "Открыть в Google Maps ↗", officialSite: "Официальный сайт ↗", language: "Язык", databaseError: "Не достучались до базы.",
  },
  ja: {
    heroTitle: "わざわざ<br>足を運びたい場所。", heroLead: "「東京おすすめ10選」ではなく、少し不思議で、美しく、遠くても訪れたい特別な場所。", loading: "公開中の場所を読み込んでいます…",
    statsLabel: "統計", publishedPlaces: "件を公開中", prefectures: "都道府県", routes: "ルート",
    databaseEmptyTitle: "接続済みですが、公開中の場所はまだありません。", databaseEmptyText: "すべての場所が下書きになっています。",
    search: "検索", searchPlaceholder: "名前、タグ、街、駅", clearSearch: "検索をクリア", prefecture: "都道府県", allPrefectures: "すべて",
    category: "カテゴリー", allCategories: "すべてのカテゴリー", visit: "訪問", allPlaces: "すべて", visitedOnly: "訪問済みのみ", unvisitedOnly: "未訪問のみ",
    adjacent: "隣接する都道府県も表示", resetFilters: "フィルターをリセット", matchingFilters: "件が条件に一致", visibleOnMap: "件を地図に表示",
    nothingFound: "見つかりませんでした", changeSearch: "検索条件を変えてみてください。", changeSearchHint: "検索をクリアするか、別の都道府県を選ぶか、地図を縮小してください。",
    noMatches: "条件に一致する場所がありません。", noMatchesHint: "検索をクリアするか、別の都道府県を選んでください。", noPlacesInView: "この地図範囲には場所がありません。", noPlacesInViewHint: "地図を縮小するか、別の地域へ移動してください。",
    unnamed: "名称未設定", place: "場所", descriptionSoon: "説明は準備中です。", openPlace: "開く", transitWalk: "分（交通機関から）", close: "閉じる",
    whyInteresting: "見どころ", time: "所要時間", fromStation: "駅から", environment: "環境", nearestStation: "最寄り駅", directions: "アクセス", hoursAndSeason: "営業時間・季節", price: "料金", reservation: "予約",
    openMaps: "Google Mapsで開く ↗", officialSite: "公式サイト ↗", language: "言語", databaseError: "データベースに接続できませんでした。",
  },
  en: {
    heroTitle: "Places worth<br>going out of your way for.", heroLead: "Not another “Top 10 Tokyo” list—just strange, beautiful, faraway and very specific places.", loading: "Loading published places…",
    statsLabel: "Statistics", publishedPlaces: "places published", prefectures: "prefectures", routes: "routes",
    databaseEmptyTitle: "Connected, but nothing is published yet.", databaseEmptyText: "All places are currently saved as drafts.",
    search: "Search", searchPlaceholder: "Name, tag, city or station", clearSearch: "Clear search", prefecture: "Prefecture", allPrefectures: "All",
    category: "Category", allCategories: "All categories", visit: "Visit", allPlaces: "All places", visitedOnly: "Visited only", unvisitedOnly: "Not visited only",
    adjacent: "Show adjacent prefectures", resetFilters: "Reset filters", matchingFilters: "match the filters", visibleOnMap: "visible on the map",
    nothingFound: "NOTHING FOUND", changeSearch: "Try changing your search.", changeSearchHint: "Clear the query, choose another prefecture or zoom out on the map.",
    noMatches: "No places match your search.", noMatchesHint: "Clear the search or choose another prefecture.", noPlacesInView: "There are no places in this map area.", noPlacesInViewHint: "Zoom out or move to another area.",
    unnamed: "Untitled", place: "Place", descriptionSoon: "Description coming soon.", openPlace: "Open", transitWalk: "min from transit", close: "Close",
    whyInteresting: "Why it’s interesting", time: "Time", fromStation: "From station", environment: "Setting", nearestStation: "Nearest station", directions: "Getting there", hoursAndSeason: "Hours & season", price: "Price", reservation: "Reservation",
    openMaps: "Open in Google Maps ↗", officialSite: "Official website ↗", language: "Language", databaseError: "Could not reach the database.",
  },
} as const;

export function uiCopy(locale: AppLocale) { return COPY[locale]; }

export function formatMinutes(minutes: number, locale: AppLocale): string {
  return locale === "ja" ? `${minutes}分` : locale === "en" ? `${minutes} min` : `${minutes} мин`;
}

export function formatDuration(minutes: number | null, locale: AppLocale): string | null {
  if (minutes == null) return null;
  if (minutes < 60) return formatMinutes(minutes, locale);
  if (minutes < 1440) {
    const hours = Math.round(minutes / 6) / 10;
    return locale === "ja" ? `${hours}時間` : locale === "en" ? `${hours} hr` : `${hours} ч`;
  }
  const days = Math.round(minutes / 1440);
  return locale === "ja" ? `${days}日` : locale === "en" ? `${days} days` : `${days} дн`;
}

export function environmentLabel(value: string | null, locale: AppLocale): string | null {
  if (!value) return null;
  const labels: Record<string, Record<AppLocale, string>> = {
    indoor: { ru: "внутри", ja: "屋内", en: "indoors" },
    outdoor: { ru: "снаружи", ja: "屋外", en: "outdoors" },
    mixed: { ru: "внутри и снаружи", ja: "屋内・屋外", en: "indoors & outdoors" },
  };
  return labels[value]?.[locale] ?? value;
}
