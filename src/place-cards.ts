import { CARD_PAGE_SIZE, getCardPage } from "./card-page";
import type { AppLocale } from "./categories";
import { uiCopy } from "./i18n";
import { placeCard } from "./place-card";
import type { Place } from "./types";

export function createPlaceCards(
  grid: HTMLElement,
  pagination: HTMLElement,
  locale: AppLocale,
  onSelect: (place: Place, card: HTMLElement) => void,
) {
  const copy = uiCopy(locale);
  const previous = pagination.querySelector<HTMLButtonElement>('[data-card-page="previous"]')!;
  const next = pagination.querySelector<HTMLButtonElement>('[data-card-page="next"]')!;
  const range = pagination.querySelector<HTMLElement>("[data-card-range]")!;
  let places: Place[] = [];
  let page = 0;
  let selectedId: number | null = null;
  let active = true;
  let nodes = new Map<number, HTMLElement>();

  function render(): void {
    const result = getCardPage(active ? places : [], page);
    page = result.page;
    const nextNodes = new Map<number, HTMLElement>();
    for (const place of result.items) {
      let node = nodes.get(place.id);
      if (!node) {
        const template = document.createElement("template");
        template.innerHTML = placeCard(place, locale);
        node = template.content.firstElementChild as HTMLElement;
      }
      node.classList.toggle("is-selected", place.id === selectedId);
      nextNodes.set(place.id, node);
    }
    // Keep existing nodes (and keyboard focus) when only selection changes.
    const currentIds = [...nodes.keys()];
    const nextIds = [...nextNodes.keys()];
    if (currentIds.length !== nextIds.length || currentIds.some((id, index) => id !== nextIds[index])) {
      grid.replaceChildren(...nextNodes.values());
    }
    nodes = nextNodes;
    grid.hidden = !active || places.length === 0;
    pagination.hidden = !active || result.pageCount <= 1;
    previous.disabled = page === 0;
    next.disabled = page + 1 >= result.pageCount;
    range.textContent = copy.cardRange(result.start, result.end, places.length);
  }

  function changePage(delta: number): void {
    page += delta;
    render();
    // After replacing cards, give keyboard users a stable entry to the page.
    nodes.values().next().value?.focus({ preventScroll: true });
    grid.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  previous.addEventListener("click", () => changePage(-1));
  next.addEventListener("click", () => changePage(1));

  function activate(event: Event): void {
    const card = (event.target as HTMLElement).closest<HTMLElement>(".place-card[data-place-id]");
    if (!card || !grid.contains(card)) return;
    const place = places.find((item) => item.id === Number(card.dataset.placeId));
    if (place) onSelect(place, card);
  }
  grid.addEventListener("click", activate);
  grid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activate(event);
  });

  return {
    update(nextPlaces: Place[], nextSelectedId: number | null, show: boolean) {
      const resultsChanged = places.length !== nextPlaces.length || places.some((place, index) => place.id !== nextPlaces[index].id);
      if (resultsChanged) page = 0;
      if (nextSelectedId !== null && (resultsChanged || nextSelectedId !== selectedId)) {
        const selectedIndex = nextPlaces.findIndex((place) => place.id === nextSelectedId);
        if (selectedIndex >= 0) page = Math.floor(selectedIndex / CARD_PAGE_SIZE);
      }
      places = nextPlaces;
      selectedId = nextSelectedId;
      active = show;
      render();
    },
  };
}
