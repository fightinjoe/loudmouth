import type { Lang } from "@catchphrase/card-schema";
import {
  commitPhrasebook,
  getReviewCards,
  updateDeckAccessTime,
  updateDeckEntryOrder,
} from "../js/db";
import type { AppHost, AppTransitions } from "../js/app-types";
import type {
  Deck,
  DeckMode,
  DeckOrder,
  Group,
  LibraryEntry,
  ReadingDisplay,
} from "../js/library-types";
import { setAttrSafe, setListHTMLSafe } from "../js/uiState";
import { icon } from "../components/icon";
import type { PreviewDeck } from "./action-pane";
import { registerCardActions } from "./content-pane-actions";
import { wireContentGestures } from "./content-pane-gestures";
import { loadDeckData } from "./content-pane-load";
import {
  getDeckChapters,
  normalizeChapterKey,
  renderBrowseBody,
  renderBrowseCardsHTML,
  renderChapter,
  renderChapterNavigation,
  renderDeckBody,
  renderIllustration,
  STARRED_CHAPTER_KEY,
  type ContentBrowse,
} from "./content-pane-render";
import { SUGGESTED_PHRASEBOOKS } from "../js/suggested-phrasebooks";

export interface SystemLanguageDeck {
  id: `lang:${Lang}`;
  name: string;
  lang: Lang;
  mode: DeckMode;
  order: DeckOrder;
  readingDisplay: ReadingDisplay;
  system: true;
}

export type ContentDeck = Deck | PreviewDeck | SystemLanguageDeck;

export function isStoredDeck(deck: ContentDeck | null): deck is Deck {
  return deck !== null && !("preview" in deck) && !("system" in deck);
}

function isPreviewDeck(deck: ContentDeck | null): deck is PreviewDeck {
  return deck !== null && "preview" in deck && deck.preview;
}

function isSystemDeck(deck: ContentDeck | null): deck is SystemLanguageDeck {
  return deck !== null && "system" in deck && deck.system;
}

export interface ContentStarPatch {
  deckId: string;
  cardId: string;
  starredAt: string | null;
}

export interface ContentSlice {
  deckId: string | null;
  deck: ContentDeck | null;
  cards: LibraryEntry[];
  groups: Group[];
  editMode: boolean;
  editOrder: string[] | null;
  menuOpen: boolean;
  chapterKey: string | null;
  starPatch: ContentStarPatch | null;
  reload: number;
  browse: ContentBrowse | null;
}

export interface ContentLoadResult {
  deck: ContentDeck | null;
  cards: LibraryEntry[];
  groups: Group[];
}

function previewGroups(deck: PreviewDeck): Group[] {
  return deck.draftGroups.map((group, position) => ({
    id: group.id,
    deckId: deck.id,
    title: group.title,
    position,
    exchanges: group.likelyExchanges.map((exchange, position) => ({
      id: exchange.id, title: exchange.title, position,
    })),
    wordFamilies: group.words.map((family, position) => ({
      id: family.id, title: family.title, position,
    })),
  }));
}

function resolvedGroups(deck: ContentDeck | null, groups?: Group[]): Group[] {
  if (groups) return groups;
  return isPreviewDeck(deck) ? previewGroups(deck) : [];
}


const initialState: ContentSlice = {
  deckId: null,
  deck: null,
  cards: [],
  groups: [],
  editMode: false,
  editOrder: null,
  menuOpen: false,
  chapterKey: null,
  starPatch: null,
  reload: 0,
  browse: null,
};

const transitions = {
  "content/select-deck": (slice, { id }) => ({
    ...slice,
    deckId: id,
    browse: null,
    ...(id !== slice.deckId
      ? { deck: null, cards: [], groups: [], chapterKey: null, starPatch: null }
      : {}),
  }),

  "content/reload-deck": (slice) => ({
    ...slice,
    reload: slice.reload + 1,
  }),

  "content/loaded": (slice, { deck, cards, groups }) => {
    const nextGroups = resolvedGroups(deck, groups);
    return {
      ...slice,
      deckId: deck?.id ?? null,
      deck,
      cards,
      groups: nextGroups,
      editMode: false,
      editOrder: null,
      menuOpen: false,
      browse: null,
      chapterKey: deck && !isSystemDeck(deck)
        ? normalizeChapterKey(cards, nextGroups, slice.deckId === deck.id ? slice.chapterKey : null)
        : null,
      starPatch: null,
    };
  },

  "content/illustration-updated": (slice, { deckId, illustration }) => {
    if (!isStoredDeck(slice.deck) || slice.deck.id !== deckId
      || slice.deck.illustration?.requestId !== illustration.requestId
      || (slice.deck.illustration.state === "ready" && illustration.state !== "ready")) return slice;
    return { ...slice, deck: { ...slice.deck, illustration } };
  },

  "content/cards-changed": (slice, { cards, groups, deckId }) => {
    if (deckId !== undefined && deckId !== slice.deckId) return slice;
    const nextGroups = groups ?? slice.groups;
    return {
      ...slice,
      cards,
      groups: nextGroups,
      chapterKey: normalizeChapterKey(cards, nextGroups, slice.chapterKey),
      starPatch: null,
    };
  },

  "content/card-star-changed": (slice, { deckId, cardId, starredAt }) => {
    if (!isStoredDeck(slice.deck) || slice.deck.id !== deckId) return slice;
    let changed = false;
    const cards = slice.cards.map((entry) => {
      const membership = entry.membership;
      if (entry.cardId !== cardId || !membership || membership.deckId !== deckId) {
        return entry;
      }
      changed = true;
      return {
        ...entry,
        membership: { ...membership, starredAt },
      };
    });
    if (!changed) return slice;
    return { ...slice, cards, starPatch: { deckId, cardId, starredAt } };
  },

  "content/jump-chapter": (slice, { chapterKey }) => {
    if (!slice.deck || isSystemDeck(slice.deck)) return slice;
    const key = normalizeChapterKey(slice.cards, slice.groups, chapterKey);
    return key === slice.chapterKey ? slice : { ...slice, chapterKey: key };
  },

  "content/enter-edit": (slice) => isStoredDeck(slice.deck)
    ? {
        ...slice,
        editMode: true,
        menuOpen: false,
        editOrder: slice.cards.map((entry) => entry.key),
      }
    : slice,

  // Replace only the reordered section's slots; persistence gets every entry key.
  "content/reorder": (slice, { pageOrder }) => {
    if (!slice.editMode || !slice.editOrder) return slice;
    const pageKeys = pageOrder.filter((key, index) =>
      slice.editOrder?.includes(key) && pageOrder.indexOf(key) === index);
    if (pageKeys.length < 2) return slice;
    const entries = pageKeys.map((key) => slice.cards.find((entry) => entry.key === key)!);
    const first = entries[0];
    if (entries.some((entry) =>
      entry.card.type !== first.card.type
      || entry.occurrence?.groupId !== first.occurrence?.groupId
      || entry.occurrence?.section !== first.occurrence?.section
      || entry.occurrence?.exchangeId !== first.occurrence?.exchangeId
      || entry.occurrence?.turnIndex !== first.occurrence?.turnIndex
      || entry.wordPlacement?.groupId !== first.wordPlacement?.groupId
      || entry.wordPlacement?.familyId !== first.wordPlacement?.familyId)) return slice;
    const pageSet = new Set(pageKeys);
    const current = slice.editOrder.filter((key) => pageSet.has(key));
    if (current.length !== pageKeys.length
      || current.every((key, index) => key === pageKeys[index])) return slice;
    let replacementIndex = 0;
    const editOrder = slice.editOrder.map((key) =>
      pageSet.has(key) ? pageKeys[replacementIndex++] : key);
    return { ...slice, editOrder };
  },

  "content/confirm-edit": (slice) => {
    if (!slice.editMode || !slice.editOrder) return slice;
    const byKey = new Map(slice.cards.map((entry) => [entry.key, entry]));
    const cards = slice.editOrder.flatMap((key) => {
      const entry = byKey.get(key);
      return entry ? [entry] : [];
    });
    return {
      ...slice,
      cards,
      editMode: false,
      editOrder: null,
      menuOpen: false,
      starPatch: null,
    };
  },

  "content/cancel-edit": (slice) => ({
    ...slice,
    editMode: false,
    editOrder: null,
    menuOpen: false,
  }),

  "content/toggle-menu": (slice) => ({ ...slice, menuOpen: !slice.menuOpen }),
  "content/close-menu": (slice) => ({ ...slice, menuOpen: false }),
  "content/browse": (slice, payload) => ({ ...slice, browse: payload }),
  "content/browse-back": (slice) => ({ ...slice, browse: null }),
} satisfies AppTransitions;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The change could not be saved.";
}

const contentPane = {
  namespace: "content" as const,
  initialState,
  transitions,

  render(initial: ContentSlice): string {
    return `
      <div id="content-pane" class="content-pane absolute-inset flex-col bg-surface transition-transform"${initial.deck ? "" : " data-empty"}>
        <div class="meat screen flex-1 flex-col bg-surface overflow-hidden" data-region="content-body">
          ${renderDeckBody(initial.deck, initial.cards, initial.groups, initial.chapterKey)}
        </div>
        <div id="reorder-handle" class="reorder-handle" aria-hidden="true"></div>
        <div id="deck-title-menu-scrim" data-action="content/close-menu"></div>
        <div id="deck-title-menu" class="deck-title-menu bg-surface overflow-hidden">
          <button class="deck-title-menu-item fg-body text-menu-item text-left tappable" data-action="content/menu-settings">Settings</button>
          <button class="deck-title-menu-item fg-body text-menu-item text-left tappable" data-action="content/menu-edit">Reorder cards</button>
        </div>
      </div>
    `;
  },

  bindEvents(rootEl: HTMLElement, host: AppHost): () => void {
    const { ui, delegate, stageEl } = host;
    if (!delegate || !stageEl) throw new Error("Content pane requires a delegate and stage element");
    const meatEl = rootEl.querySelector<HTMLElement>('[data-region="content-body"]');
    const handleEl = stageEl.querySelector<HTMLElement>(".shell-swipe-handle");
    const reorderHandleEl = rootEl.querySelector<HTMLElement>("#reorder-handle");
    const menuEl = rootEl.querySelector<HTMLElement>("#deck-title-menu");
    if (!meatEl || !handleEl || !reorderHandleEl || !menuEl) {
      throw new Error("Content pane is missing required elements");
    }


    function visibleEntries(slice: ContentSlice): LibraryEntry[] {
      if (!slice.editMode || !slice.editOrder) return slice.cards;
      const byKey = new Map(slice.cards.map((entry) => [entry.key, entry]));
      return slice.editOrder.flatMap((key) => {
        const entry = byKey.get(key);
        return entry ? [entry] : [];
      });
    }

    const captureScrolls = (): Map<string, [number, number]> => {
      const positions = new Map<string, [number, number]>();
      meatEl.querySelectorAll<HTMLElement>('[data-region="textbook-reader"], .textbook-shelf, .deck-view-list').forEach((element) => {
        const key = element.matches(".textbook-shelf")
          ? `${element.closest<HTMLElement>("[data-chapter-key]")?.dataset.chapterKey}:${element.dataset.reorderRegion}`
          : element.dataset.region ?? "browse";
        positions.set(key, [element.scrollLeft, element.scrollTop]);
      });
      return positions;
    };

    const restoreScrolls = (positions: ReadonlyMap<string, [number, number]>): void => {
      meatEl.querySelectorAll<HTMLElement>('[data-region="textbook-reader"], .textbook-shelf, .deck-view-list').forEach((element) => {
        const key = element.matches(".textbook-shelf")
          ? `${element.closest<HTMLElement>("[data-chapter-key]")?.dataset.chapterKey}:${element.dataset.reorderRegion}`
          : element.dataset.region ?? "browse";
        const position = positions.get(key);
        if (position) { element.scrollLeft = position[0]; element.scrollTop = position[1]; }
      });
    };

    const jumpChapter = (key: string | null): void => {
      if (!key) return;
      const chapter = [...meatEl.querySelectorAll<HTMLElement>(".textbook-chapter")]
        .find((element) => element.dataset.chapterKey === key);
      const reader = meatEl.querySelector<HTMLElement>('[data-region="textbook-reader"]');
      if (!chapter || !reader) return;
      reader.scrollTop += chapter.getBoundingClientRect().top - reader.getBoundingClientRect().top;
      chapter.focus({ preventScroll: true });
    };

    const showInlineError = (message: string | null): void => {
      const errorElement = meatEl.querySelector<HTMLElement>('[data-region="content-error"]');
      if (!errorElement) return;
      errorElement.textContent = message ?? "";
      errorElement.hidden = message === null;
    };

    const patchStar = (patch: ContentStarPatch, entries: readonly LibraryEntry[]): void => {
      if (!entries.some((candidate) => candidate.cardId === patch.cardId)) return;
      const starred = patch.starredAt !== null;
      meatEl.querySelectorAll<HTMLButtonElement>(".card-star[data-card-id]")
        .forEach((button) => {
          if (button.dataset.cardId !== patch.cardId) return;
          const entry = entries.find(
            (candidate) => candidate.key === button.dataset.entryKey,
          );
          button.dataset.selected = String(starred);
          button.setAttribute("aria-pressed", String(starred));
          button.setAttribute(
            "aria-label",
            `${starred ? "Unstar" : "Star"}: ${entry?.card.translation ?? ""}`,
          );
          button.innerHTML = icon(starred ? "star-fill" : "star");
        });
    };

    const updateChapters = (next: ContentSlice, starOnly = false): void => {
      if (!next.deck) return;
      const container = meatEl.querySelector<HTMLElement>('[data-region="textbook-chapters"]');
      if (!container) return;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const focusedChapter = active?.closest<HTMLElement>(".textbook-chapter");
      const focusedKey = focusedChapter?.dataset.chapterKey;
      const focusedEntry = active?.closest<HTMLElement>("[data-entry-key]")?.dataset.entryKey;
      const focusedStar = active?.matches(".card-star") ?? false;
      const focusedStars = [...focusedChapter?.querySelectorAll<HTMLElement>(".card-star") ?? []];
      const focusedIndex = active ? focusedStars.indexOf(active) : -1;
      const scrolls = captureScrolls();
      const chapters = getDeckChapters(visibleEntries(next), next.groups);
      const existing = new Map([...container.children].map((element) =>
        [(element as HTMLElement).dataset.chapterKey, element as HTMLElement]));
      const keys = new Set(chapters.map((chapter) => chapter.key));
      for (const [key, element] of existing) {
        if (!key || !keys.has(key)) element.remove();
      }
      chapters.forEach((chapter, index) => {
        let current = existing.get(chapter.key);
        if (!current) {
          const template = document.createElement("template");
          template.innerHTML = renderChapter(chapter, next.deck!, index);
          current = template.content.firstElementChild as HTMLElement;
        } else if (!starOnly || chapter.key === STARRED_CHAPTER_KEY) {
          const template = document.createElement("template");
          template.innerHTML = renderChapter(chapter, next.deck!, index);
          const fresh = template.content.firstElementChild!;
          const list = current.querySelector<HTMLElement>('[data-region="chapter-cards"]');
          const nextList = fresh.querySelector<HTMLElement>('[data-region="chapter-cards"]');
          if (list && nextList && list.innerHTML !== nextList.innerHTML) setListHTMLSafe(list, nextList.innerHTML);
          const title = current.querySelector(".textbook-chapter-title");
          const nextTitle = fresh.querySelector(".textbook-chapter-title");
          if (title && nextTitle && title.innerHTML !== nextTitle.innerHTML) title.innerHTML = nextTitle.innerHTML;
        }
        if (container.children[index] !== current) container.insertBefore(current, container.children[index] ?? null);
      });
      const navigation = meatEl.querySelector<HTMLElement>('[data-region="chapter-navigation"]');
      if (navigation) {
        if (starOnly) {
          navigation.querySelectorAll(".textbook-star-count").forEach((count) => {
            count.textContent = String(chapters.find((chapter) => chapter.kind === "starred")?.entries.length ?? 0);
          });
        } else {
          const open = navigation.querySelector("details")?.open ?? false;
          setListHTMLSafe(navigation, renderChapterNavigation(chapters));
          const details = navigation.querySelector("details");
          if (details) details.open = open;
        }
      }
      const count = chapters.find((chapter) => chapter.kind === "starred")?.entries.length ?? 0;
      const status = meatEl.querySelector('[data-region="starred-status"]');
      if (status) status.textContent = `${count} cards starred in this phrasebook.`;
      restoreScrolls(scrolls);
      if (!active || active.isConnected || !focusedKey) return;
      const chapter = [...container.children].find((element) =>
        (element as HTMLElement).dataset.chapterKey === focusedKey) as HTMLElement | undefined;
      const row = [...chapter?.querySelectorAll<HTMLElement>(".card-row-wrapper") ?? []]
        .find((element) => element.dataset.entryKey === focusedEntry);
      const target = row?.querySelector<HTMLElement>(focusedStar ? ".card-star" : ".card-term")
        ?? (focusedIndex >= 0 ? [...chapter?.querySelectorAll<HTMLElement>(".card-star") ?? []][focusedIndex] : null)
        ?? chapter
        ?? meatEl.querySelector<HTMLElement>(".textbook-star-link");
      target?.focus({ preventScroll: true });
    };
    const unsubContent = ui.subscribe("content", (next, previous) => {
      const deckChanged = next.deck !== previous.deck;
      const samePhrasebook = isStoredDeck(next.deck) && isStoredDeck(previous.deck)
        && next.deck.id === previous.deck.id;
      const browseChanged = next.browse !== previous.browse;
      const cardsChanged = next.cards !== previous.cards;
      const groupsChanged = next.groups !== previous.groups;
      const chapterChanged = next.chapterKey !== previous.chapterKey;
      const reorderedWhileEditing = next.editMode
        && previous.editMode
        && next.editOrder !== previous.editOrder;
      const leavingEditOrder = previous.editMode
        && !next.editMode
        && previous.editOrder !== null;

      const illustrationOnly = samePhrasebook && deckChanged
        && !cardsChanged && !groupsChanged
        && next.deck && previous.deck
        && "illustration" in next.deck && "illustration" in previous.deck
        && next.deck.illustration !== previous.deck.illustration;
      if (illustrationOnly && next.deck && "illustration" in next.deck) {
        const hero = meatEl.querySelector<HTMLElement>('[data-region="deck-hero"]');
        if (hero) hero.innerHTML = renderIllustration(next.deck.illustration);
      } else if (browseChanged || (deckChanged && !samePhrasebook)) {
        const scrolls = next.deckId === previous.deckId ? captureScrolls() : new Map<string, [number, number]>();
        meatEl.innerHTML = next.browse
          ? renderBrowseBody(next.browse)
          : renderDeckBody(next.deck, next.cards, next.groups, next.chapterKey);
        restoreScrolls(scrolls);
      } else if (!next.browse
        && cardsChanged
        && next.starPatch
        && next.starPatch !== previous.starPatch) {
        patchStar(next.starPatch, next.cards);
        updateChapters(next, true);
      } else if (!next.browse
        && (deckChanged || cardsChanged || groupsChanged || reorderedWhileEditing || leavingEditOrder)) {
        const orderedEntries = visibleEntries(next);
        if (next.deck && isSystemDeck(next.deck)) {
          const list = meatEl.querySelector<HTMLElement>(
            '.deck-view-list[data-region="card-list"]',
          );
          if (list) {
            setListHTMLSafe(
              list,
              renderBrowseCardsHTML(next.deck, orderedEntries, next.groups),
            );
          }
        } else if (next.deck) {
          updateChapters(next);
          const title = meatEl.querySelector<HTMLElement>(".pane-header-title");
          if (title && title.textContent !== next.deck.name) title.textContent = next.deck.name;
        }
      } else if (!next.browse && chapterChanged) {
        jumpChapter(next.chapterKey);
      }


      if (cardsChanged || deckChanged || browseChanged) {
        const reviewButton = meatEl.querySelector<HTMLButtonElement>('[data-action="content/review"]');
        if (reviewButton) {
          reviewButton.disabled = !isStoredDeck(next.deck)
            || !next.cards.some((entry) => entry.membership?.starredAt != null);
        }
      }

      setAttrSafe(rootEl, "editMode", next.editMode ? "" : null);
      setAttrSafe(handleEl, "readingShelves", meatEl.querySelector(".textbook-reader") ? "" : null);
      setAttrSafe(rootEl, "menuOpen", next.menuOpen ? "" : null);
      setAttrSafe(rootEl, "empty", next.browse || next.deck ? null : "");
      if (next.menuOpen && !previous.menuOpen) positionTitleMenu();
      if (next.deck?.mode) stageEl.dataset.deckMode = next.deck.mode;
      else delete stageEl.dataset.deckMode;
    });

    const positionTitleMenu = (): void => {
      const anchor = meatEl.querySelector<HTMLElement>('[data-action="content/deck-title"]');
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const origin = rootEl.getBoundingClientRect();
      // The transformed content pane is the fixed menu's containing block.
      menuEl.style.top = `${rect.bottom - origin.top + 4}px`;
      menuEl.style.left = `${rect.left - origin.left + rect.width / 2}px`;
    };

    let inflight = 0;
    const unsubLoad = ui.subscribe("content", (next, previous) => {
      if (isPreviewDeck(next.deck) && next.deck.id === next.deckId) {
        inflight += 1;
        return;
      }
      if (next.deckId === previous.deckId && next.reload === previous.reload) return;
      const stamp = ++inflight;
      void loadDeckData(next.deckId).then((data) => {
        if (stamp === inflight) ui.transition("content/loaded", data);
      }).catch((error: unknown) => {
        if (stamp === inflight) showInlineError(errorMessage(error));
      });
    });

    function isEdit(): boolean {
      return ui.get("content").editMode;
    }
    const gestures = wireContentGestures({
      rootEl,
      handleEl,
      reorderHandleEl,
      ui,
      isEdit,
    });
    delegate.register("content/menu", () => ui.transition("shell/toggle"));

    delegate.register("content/deck-title", () => {
      const deck = ui.get("content").deck;
      if (isSystemDeck(deck)) ui.transition("shell/toggle");
      else if (isStoredDeck(deck)) ui.transition("content/toggle-menu");
    });

    delegate.register("content/menu-settings", () => {
      ui.transition("content/close-menu");
      const { deck, cards } = ui.get("content");
      if (isStoredDeck(deck)) {
        ui.transition("action/open", { kind: "settings", payload: { deck, cards } });
      }
    });

    delegate.register("content/menu-edit", () => {
      ui.transition("content/close-menu");
      ui.transition("content/enter-edit");
    });

    delegate.register("content/close-menu", () => ui.transition("content/close-menu"));

    delegate.register("content/done", (_event, element) => {
      const slice = ui.get("content");
      if (!slice.editMode || !slice.editOrder || !isStoredDeck(slice.deck)) return;
      const deckId = slice.deck.id;
      const order = [...slice.editOrder];
      const button = element instanceof HTMLButtonElement ? element : null;
      if (button) button.disabled = true;
      showInlineError(null);
      void updateDeckEntryOrder(deckId, order).then(() => {
        const current = ui.get("content");
        if (isStoredDeck(current.deck)
          && current.deck.id === deckId
          && current.editMode) {
          ui.transition("content/confirm-edit");
        }
      }).catch((error: unknown) => {
        const current = ui.get("content");
        if (isStoredDeck(current.deck) && current.deck.id === deckId) {
          showInlineError(errorMessage(error));
        }
      }).finally(() => {
        if (button?.isConnected) button.disabled = false;
      });
    });

    delegate.register("content/review", (_event, element) => {
      const slice = ui.get("content");
      if (!isStoredDeck(slice.deck)) return;
      const deck = slice.deck;
      const button = element instanceof HTMLButtonElement ? element : null;
      if (button) button.disabled = true;
      void getReviewCards(deck.id).then((cards) => {
        const current = ui.get("content");
        if (!isStoredDeck(current.deck) || current.deck.id !== deck.id || cards.length === 0) {
          return;
        }
        ui.transition("action/open", { kind: "review", payload: { deck, cards } });
      }).catch((error: unknown) => {
        const current = ui.get("content");
        if (isStoredDeck(current.deck) && current.deck.id === deck.id) {
          showInlineError(errorMessage(error));
        }
      }).finally(() => {
        if (button?.isConnected) {
          const current = ui.get("content");
          button.disabled = !isStoredDeck(current.deck)
            || current.deck.id !== deck.id
            || !current.cards.some((entry) => entry.membership?.starredAt != null);
        }
      });
    });

    delegate.register("content/save-preview", (_event, element) => {
      const preview = ui.get("content").deck;
      if (!isPreviewDeck(preview)) return;
      const previewId = preview.id;
      const button = element instanceof HTMLButtonElement ? element : null;
      if (button) button.disabled = true;
      showInlineError(null);
      void commitPhrasebook({
        name: preview.name,
        lang: preview.lang,
        ability: preview.ability,
        seedId: preview.seedId,
        groups: preview.draftGroups,
        selectedIndexes: preview.draftGroups.map((_group, index) => index),
      }).then((realDeck) => {
        if (ui.get("content").deck?.id !== previewId) return;
        ui.transition("nav/reload");
        ui.transition("content/select-deck", { id: realDeck.id });
      }).catch((error: unknown) => {
        if (ui.get("content").deck?.id === previewId) {
          showInlineError(errorMessage(error));
        }
      }).finally(() => {
        if (button?.isConnected) button.disabled = false;
      });
    });

    delegate.register("content/browse-back", () => ui.transition("content/browse-back"));

    delegate.register("content/browse-select", (_event, element) => {
      const id = element.dataset.deckId;
      if (!id) return;
      void updateDeckAccessTime(id);
      ui.transition("content/select-deck", { id });
    });

    delegate.register("content/browse-view-suggested", (_event, element) => {
      const suggestion = SUGGESTED_PHRASEBOOKS.find(
        (candidate) => candidate.id === element.dataset.suggestionId,
      );
      if (suggestion) {
        ui.transition("action/open", {
          kind: "new-phrasebook",
          payload: { suggestion },
        });
      }
    });

    delegate.register("content/jump-chapter", (_event, element) => {
      const chapterKey = element.dataset.chapterKey;
      if (!chapterKey) return;
      const details = element.closest("details");
      if (details) details.open = false;
      ui.transition("content/jump-chapter", { chapterKey });
      jumpChapter(chapterKey);
    });
    delegate.register("content/cancel-edit", () => ui.transition("content/cancel-edit"));

    const unregisterCardActions = registerCardActions({ host, rootEl, isEdit });
    const registeredActions = [
      "content/menu",
      "content/deck-title",
      "content/menu-settings",
      "content/menu-edit",
      "content/close-menu",
      "content/done",
      "content/review",
      "content/save-preview",
      "content/browse-back",
      "content/browse-select",
      "content/browse-view-suggested",
      "content/jump-chapter",
      "content/cancel-edit",
    ];

    return () => {
      unsubContent();
      unsubLoad();
      unregisterCardActions();
      gestures.dispose();
      handleEl.removeAttribute("data-reading-shelves");
      for (const action of registeredActions) delegate.unregister(action);
    };
  },
};

export default contentPane;
