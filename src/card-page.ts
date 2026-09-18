export const CARD_PAGE_SIZE = 30;

export function getCardPage<T>(items: T[], requestedPage: number) {
  const pageCount = Math.ceil(items.length / CARD_PAGE_SIZE);
  const page = Math.max(0, Math.min(requestedPage, pageCount - 1));
  const start = page * CARD_PAGE_SIZE;
  return {
    page,
    pageCount,
    items: items.slice(start, start + CARD_PAGE_SIZE),
    start: items.length ? start + 1 : 0,
    end: Math.min(start + CARD_PAGE_SIZE, items.length),
  };
}
