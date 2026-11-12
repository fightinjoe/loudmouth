import type { Lang } from "@catchphrase/card-schema";
import {
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
import {
  entryChapterKey,
  getDeckChapters,
  normalizeChapterKey,
  STARRED_CHAPTER_KEY,
  STARRED_TABS,
  type StarredTab,
} from "../js/phrasebook-chapters";
import { setAttrSafe, setListHTMLSafe } from "../js/uiState";
import { icon } from "../components/icon";
import { renderChapterMenu, renderChapterSheetBody } from "../components/chapter-sheet";
import { registerCardActions } from "./content-pane-actions";
import { wireContentGestures } from "./content-pane-gestures";
import { loadDeckData } from "./content-pane-load";
import {
  entryContextLabel,
  renderBrowseBody,
  renderBrowseCardsHTML,
  renderDeckBody,
  renderIllustration,
  renderChapterList,
  renderStarredSlot,
  type ContentBrowse,
} from "./content-pane-render";

export interface SystemLanguageDeck {
  id: `lang:${Lang}`;
  name: string;
  lang: Lang;
  mode: DeckMode;
  order: DeckOrder;
  readingDisplay: ReadingDisplay;
  system: true;
}

export type ContentDeck = Deck | SystemLanguageDeck;

export function isStoredDeck(deck: ContentDeck | null): deck is Deck {
  return deck !== null && !("system" in deck);
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
  /** Chapter shown in the sheet (a category, Starred, or a collection); null while the landing page is in front. */
  chapterKey: string | null;
  /** Starred tab remembered for this phrasebook during the session. */
  starredTab: StarredTab;
  starPatch: ContentStarPatch | null;
  reload: number;
  browse: ContentBrowse | null;
}

export interface ContentLoadResult {
  deck: ContentDeck | null;
  cards: LibraryEntry[];
  groups: Group[];
}

/** A tab applies only to Starred, the one chapter with tabs. */
function withStarredTab(slice: ContentSlice, chapterKey: string | null, tab: StarredTab | undefined): ContentSlice {
  return chapterKey === STARRED_CHAPTER_KEY && tab && STARRED_TABS.some(({ key }) => key === tab) && slice.starredTab !== tab
    ? { ...slice, starredTab: tab } : slice;
}

const initialState: ContentSlice = {
  deckId: null,
  deck: null,
  cards: [],
  groups: [],
  editMode: false,
  editOrder: null,
  chapterKey: null,
  starredTab: "words",
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
      ? { deck: null, cards: [], groups: [], chapterKey: null, starredTab: "words", starPatch: null }
      : {}),
  }),

  "content/reload-deck": (slice) => ({
    ...slice,
    reload: slice.reload + 1,
  }),

  "content/loaded": (slice, { deck, cards, groups }) => {
    const nextGroups = groups ?? [];
    return {
      ...slice,
      deckId: deck?.id ?? null,
      deck,
      cards,
      groups: nextGroups,
      editMode: false,
      editOrder: null,
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

  // Opening Starred keeps its remembered tab unless a card names one.
  "content/open-chapter": (slice, { chapterKey, tab }) => {
    if (!slice.deck || isSystemDeck(slice.deck)) return slice;
    const key = normalizeChapterKey(slice.cards, slice.groups, chapterKey);
    if (!key || (slice.editMode && key !== slice.chapterKey)) return slice;
    const next = withStarredTab(slice, key, tab);
    return key === next.chapterKey ? next : { ...next, chapterKey: key };
  },

  "content/close-chapter": (slice) => slice.chapterKey === null ? slice : {
    ...slice,
    chapterKey: null,
    editMode: false,
    editOrder: null,
  },

  "content/select-tab": (slice, { tab }) => withStarredTab(slice, slice.chapterKey, tab),

  "content/enter-edit": (slice) => isStoredDeck(slice.deck)
    && slice.chapterKey !== null && slice.chapterKey !== STARRED_CHAPTER_KEY
    ? {
        ...slice,
        editMode: true,
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
      starPatch: null,
    };
  },

  "content/cancel-edit": (slice) => ({
    ...slice,
    editMode: false,
    editOrder: null,
  }),

  "content/browse": (slice, payload) => ({ ...slice, browse: payload }),
  "content/browse-back": (slice) => ({ ...slice, browse: null }),
} satisfies AppTransitions;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The change could not be saved.";
}

/** Header switches from bubble to bar past COLLAPSE_AT and back below EXPAND_AT; the gap prevents flicker. */
const COLLAPSE_AT = 150;
const EXPAND_AT = 110;
const SCROLLERS = '[data-region="textbook-reader"], .chapter-row, .chapter-pager, .chapter-page, .deck-view-list';
const MENU_OPEN_CLASS = "chapter-sheet--menu-open";
const COLLAPSED_CLASS = "phrasebook--collapsed";
const FLASH_CLASS = "chapter-flash";

const contentPane = {
  namespace: "content" as const,
  initialState,
  transitions,

  render(initial: ContentSlice): string {
    return `
      <div id="content-pane" class="content-pane absolute-inset flex-col bg-surface transition-transform"${initial.deck ? "" : " data-empty"}>
        <div class="meat screen flex-1 flex-col bg-surface overflow-hidden" data-region="content-body">
          ${renderDeckBody(initial.deck, initial.cards, initial.groups)}
        </div>
        <div id="reorder-handle" class="reorder-handle" aria-hidden="true"></div>
      </div>
    `;
  },

  bindEvents(rootEl: HTMLElement, host: AppHost): () => void {
    const { ui, delegate, stageEl } = host;
    if (!delegate || !stageEl) throw new Error("Content pane requires a delegate and stage element");
    const meatEl = rootEl.querySelector<HTMLElement>('[data-region="content-body"]');
    const handleEl = stageEl.querySelector<HTMLElement>(".shell-swipe-handle");
    const reorderHandleEl = rootEl.querySelector<HTMLElement>("#reorder-handle");
    if (!meatEl || !handleEl || !reorderHandleEl) {
      throw new Error("Content pane is missing required elements");
    }

    let disposed = false;
    let ownerVersion = 0;
    const isCurrentOwner = (version: number): boolean => !disposed && version === ownerVersion;
    /** The landing control that opened the chapter sheet; focus returns here on close. */
    let sheetOpener: HTMLElement | null = null;
    let headerFrame = 0;
    let pagerSettleTimer: number | undefined;

    function visibleEntries(slice: ContentSlice): LibraryEntry[] {
      if (!slice.editMode || !slice.editOrder) return slice.cards;
      const byKey = new Map(slice.cards.map((entry) => [entry.key, entry]));
      return slice.editOrder.flatMap((key) => {
        const entry = byKey.get(key);
        return entry ? [entry] : [];
      });
    }

    const region = (name: string): HTMLElement | null => meatEl.querySelector<HTMLElement>(`[data-region="${name}"]`);

    const scrollKey = (element: HTMLElement): string => element.matches(".chapter-row")
      ? `row:${element.closest<HTMLElement>("[data-chapter-key]")?.dataset.chapterKey}`
      : element.matches(".chapter-page") ? `page:${element.dataset.tab}` : element.dataset.region ?? "browse";

    const captureScrolls = (): Map<string, [number, number]> => {
      const positions = new Map<string, [number, number]>();
      meatEl.querySelectorAll<HTMLElement>(SCROLLERS).forEach((element) => {
        positions.set(scrollKey(element), [element.scrollLeft, element.scrollTop]);
      });
      return positions;
    };

    const restoreScrolls = (positions: ReadonlyMap<string, [number, number]>): void => {
      meatEl.querySelectorAll<HTMLElement>(SCROLLERS).forEach((element) => {
        const position = positions.get(scrollKey(element));
        if (position) { element.scrollLeft = position[0]; element.scrollTop = position[1]; }
      });
    };

    const showInlineError = (message: string | null): void => {
      const errorElement = region("content-error");
      if (!errorElement) return;
      errorElement.textContent = message ?? "";
      errorElement.hidden = message === null;
    };

    const updateCollapse = (): void => {
      const reader = region("textbook-reader");
      const y = reader?.scrollTop ?? 0;
      const collapsed = meatEl.classList.contains(COLLAPSED_CLASS);
      if (!collapsed && y > COLLAPSE_AT) meatEl.classList.add(COLLAPSED_CLASS);
      else if (collapsed && y < EXPAND_AT) meatEl.classList.remove(COLLAPSED_CLASS);
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

    const closeMenu = (restoreFocus: boolean): void => {
      const sheet = region("chapter-sheet");
      if (!sheet?.classList.contains(MENU_OPEN_CLASS)) return;
      sheet.classList.remove(MENU_OPEN_CLASS);
      const toggle = sheet.querySelector<HTMLElement>(".chapter-sheet-switch");
      toggle?.setAttribute("aria-expanded", "false");
      if (restoreFocus) toggle?.focus({ preventScroll: true });
    };

    const openMenu = (): void => {
      const sheet = region("chapter-sheet");
      if (!sheet) return;
      sheet.classList.add(MENU_OPEN_CLASS);
      sheet.querySelector(".chapter-sheet-switch")?.setAttribute("aria-expanded", "true");
      (sheet.querySelector<HTMLElement>('.chapter-menu-item[aria-checked="true"]')
        ?? sheet.querySelector<HTMLElement>(".chapter-menu-item"))?.focus({ preventScroll: true });
    };

    /** Selected tab and inert pages follow state; the pager is scrolled only by its callers. */
    const syncTabs = (slice: ContentSlice): void => {
      const body = region("chapter-sheet-body");
      if (!body) return;
      const pages = [...body.querySelectorAll<HTMLElement>(".chapter-page")];
      const wanted = slice.starredTab;
      const active = pages.some((page) => page.dataset.tab === wanted) ? wanted : pages[0]?.dataset.tab;
      body.querySelectorAll<HTMLElement>(".chapter-tab").forEach((tab) => {
        const selected = tab.dataset.tab === active;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
      pages.forEach((page) => { page.inert = page.dataset.tab !== active; });
    };

    const alignPager = (slice: ContentSlice, behavior: ScrollBehavior): void => {
      const pager = region("chapter-pager");
      if (!pager) return;
      const pages = [...pager.querySelectorAll<HTMLElement>(".chapter-page")];
      const index = Math.max(0, pages.findIndex((page) => page.dataset.tab === slice.starredTab));
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      pager.scrollTo({ left: index * pager.clientWidth, behavior: reduced ? "auto" : behavior });
    };

    const activePage = (): HTMLElement | null =>
      region("chapter-pager")?.querySelector<HTMLElement>(".chapter-page:not([inert])") ?? null;

    /** Scrolls the active page to a word family, exchange, or entry; exchanges and entries flash. */
    const reveal = (selector: string, flash: boolean): void => {
      const page = activePage();
      const target = page?.querySelector<HTMLElement>(selector);
      if (!page || !target) return;
      page.scrollTop += target.getBoundingClientRect().top - page.getBoundingClientRect().top - (flash ? 48 : 0);
      if (!flash) return;
      target.classList.remove(FLASH_CLASS);
      void target.offsetWidth;
      target.classList.add(FLASH_CLASS);
    };

    /** Rebuilds the sheet's header text, chapter menu, and (optionally) its pages. */
    const syncSheet = (slice: ContentSlice, rebuildBody: boolean): void => {
      const sheet = region("chapter-sheet");
      if (!sheet || !slice.deck) return;
      const chapters = getDeckChapters(visibleEntries(slice), slice.groups);
      const chapter = chapters.find((candidate) => candidate.key === slice.chapterKey) ?? null;
      setAttrSafe(rootEl, "chapterOpen", chapter ? "" : null);
      setAttrSafe(sheet, "chapterKind", chapter?.kind ?? null);
      const title = region("chapter-sheet-title");
      if (title && chapter && title.textContent !== chapter.title) title.textContent = chapter.title;
      sheet.querySelector(".chapter-sheet-switch")?.setAttribute("aria-label", chapter ? `${chapter.title}, choose another chapter` : "Choose a chapter");
      const menu = region("chapter-menu");
      const menuHTML = renderChapterMenu(chapters, slice.chapterKey);
      if (menu && menu.innerHTML !== menuHTML) setListHTMLSafe(menu, menuHTML);
      const body = region("chapter-sheet-body");
      if (rebuildBody && body && chapter) {
        const html = renderChapterSheetBody(chapter, {
          readingDisplay: slice.deck.readingDisplay,
          tab: slice.starredTab,
          contextFor: (entry) => entryContextLabel(entry, chapters),
        });
        if (body.innerHTML !== html) setListHTMLSafe(body, html);
      }
      syncTabs(slice);
      const landingInert = chapter !== null;
      [region("book-header"), region("textbook-reader"), meatEl.querySelector<HTMLElement>(".textbook-review-bar")]
        .forEach((element) => { if (element) element.inert = landingInert; });
    };

    /** Landing cards, Starred card, open sheet, and status after card data changes. */
    const updatePhrasebook = (next: ContentSlice, starOnly = false): void => {
      if (!next.deck) return;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const scope = active?.closest<HTMLElement>('[data-region="chapter-sheet-body"], [data-region="chapter-cards"]');
      const scopeName = scope?.dataset.region;
      const focusedEntry = active?.closest<HTMLElement>("[data-entry-key]")?.dataset.entryKey;
      const focusedStar = active?.matches(".card-star") ?? false;
      // Stars on hidden (inert) tab pages cannot take focus, so successors come from the visible page only.
      const visibleStars = (root: HTMLElement | null | undefined): HTMLElement[] =>
        [...root?.querySelectorAll<HTMLElement>(".card-star") ?? []].filter((star) => !star.closest("[inert]"));
      const focusedIndex = active && scope ? visibleStars(scope).indexOf(active) : -1;
      const scrolls = captureScrolls();
      const chapters = getDeckChapters(visibleEntries(next), next.groups);
      const starredSlot = region("starred-card");
      const starredHTML = renderStarredSlot(chapters);
      if (starredSlot && starredSlot.innerHTML !== starredHTML) setListHTMLSafe(starredSlot, starredHTML);
      if (!starOnly) {
        const list = region("chapter-list");
        const listHTML = renderChapterList(chapters);
        if (list && list.innerHTML !== listHTML) setListHTMLSafe(list, listHTML);
      }
      syncSheet(next, !starOnly || next.chapterKey === STARRED_CHAPTER_KEY);
      const count = chapters.find((chapter) => chapter.kind === "starred")?.entries.length ?? 0;
      const status = region("starred-status");
      if (status) status.textContent = `${count} cards starred in this phrasebook.`;
      restoreScrolls(scrolls);
      if (!active || active.isConnected || !scopeName) return;
      const nextScope = region(scopeName);
      const row = [...nextScope?.querySelectorAll<HTMLElement>(".card-row-wrapper") ?? []]
        .find((element) => element.dataset.entryKey === focusedEntry);
      const target = row?.querySelector<HTMLElement>(focusedStar ? ".card-star" : ".card-term")
        ?? (focusedIndex >= 0 ? visibleStars(nextScope)[focusedIndex] : null)
        ?? (next.chapterKey ? meatEl.querySelector<HTMLElement>(".chapter-sheet-back") : meatEl.querySelector<HTMLElement>(".chapter-card-header"));
      target?.focus({ preventScroll: true });
    };

    /** Opening focuses Back; switching keeps the switcher focused; closing returns to the opener. */
    const chapterMoved = (next: ContentSlice, previous: ContentSlice): void => {
      closeMenu(false);
      syncSheet(next, true);
      alignPager(next, "auto");
      if (next.chapterKey && !previous.chapterKey) {
        region("chapter-sheet-body")?.querySelectorAll<HTMLElement>(".chapter-page").forEach((page) => { page.scrollTop = 0; });
        meatEl.querySelector<HTMLElement>(".chapter-sheet-back")?.focus({ preventScroll: true });
      } else if (next.chapterKey) {
        region("chapter-sheet-body")?.querySelectorAll<HTMLElement>(".chapter-page").forEach((page) => { page.scrollTop = 0; });
        meatEl.querySelector<HTMLElement>(".chapter-sheet-switch")?.focus({ preventScroll: true });
      } else {
        const fallback = [...meatEl.querySelectorAll<HTMLElement>(".chapter-card")]
          .find((card) => card.dataset.chapterKey === previous.chapterKey)?.querySelector<HTMLElement>(".chapter-card-header");
        (sheetOpener?.isConnected ? sheetOpener : fallback)?.focus({ preventScroll: true });
        sheetOpener = null;
      }
    };

    const unsubContent = ui.subscribe("content", (next, previous) => {
      if (next.deckId !== previous.deckId || next.reload !== previous.reload
        || (next.deck !== previous.deck && next.cards !== previous.cards)) ownerVersion += 1;
      const deckChanged = next.deck !== previous.deck;
      const samePhrasebook = isStoredDeck(next.deck) && isStoredDeck(previous.deck)
        && next.deck.id === previous.deck.id;
      const browseChanged = next.browse !== previous.browse;
      const cardsChanged = next.cards !== previous.cards;
      const groupsChanged = next.groups !== previous.groups;
      const chapterChanged = next.chapterKey !== previous.chapterKey;
      const tabChanged = next.starredTab !== previous.starredTab;
      const reorderedWhileEditing = next.editMode
        && previous.editMode
        && next.editOrder !== previous.editOrder;
      const leavingEditOrder = previous.editMode
        && !next.editMode
        && previous.editOrder !== null;
      let sheetSynced = false;

      const illustrationOnly = samePhrasebook && deckChanged
        && !cardsChanged && !groupsChanged
        && next.deck && previous.deck
        && "illustration" in next.deck && "illustration" in previous.deck
        && next.deck.illustration !== previous.deck.illustration;
      if (illustrationOnly && next.deck && "illustration" in next.deck) {
        const hero = region("deck-hero");
        if (hero) hero.innerHTML = renderIllustration(next.deck.illustration);
      } else if (browseChanged || (deckChanged && !samePhrasebook)) {
        const scrolls = next.deckId === previous.deckId ? captureScrolls() : new Map<string, [number, number]>();
        meatEl.innerHTML = next.browse
          ? renderBrowseBody(next.browse)
          : renderDeckBody(next.deck, next.cards, next.groups);
        meatEl.classList.remove(COLLAPSED_CLASS);
        if (!next.browse) { syncSheet(next, true); alignPager(next, "auto"); sheetSynced = true; }
        restoreScrolls(scrolls);
        updateCollapse();
      } else if (!next.browse
        && cardsChanged
        && next.starPatch
        && next.starPatch !== previous.starPatch) {
        patchStar(next.starPatch, next.cards);
        updatePhrasebook(next, true);
      } else if (!next.browse
        && (deckChanged || cardsChanged || groupsChanged || reorderedWhileEditing || leavingEditOrder)) {
        if (next.deck && isSystemDeck(next.deck)) {
          const list = meatEl.querySelector<HTMLElement>(
            '.deck-view-list[data-region="card-list"]',
          );
          if (list) {
            setListHTMLSafe(
              list,
              renderBrowseCardsHTML(next.deck, visibleEntries(next), next.groups),
            );
          }
        } else if (next.deck) {
          updatePhrasebook(next);
          sheetSynced = !chapterChanged;
          const name = next.deck.name;
          meatEl.querySelectorAll<HTMLElement>(".phrasebook-title, .phrasebook-minibar span").forEach((title) => {
            if (title.textContent !== name) title.textContent = name;
          });
        }
      }

      if (!next.browse && chapterChanged) chapterMoved(next, previous);
      else if (!next.browse && tabChanged && !sheetSynced) syncTabs(next);

      if (cardsChanged || deckChanged || browseChanged) {
        const reviewButton = meatEl.querySelector<HTMLButtonElement>('[data-action="content/review"]');
        if (reviewButton) {
          reviewButton.disabled = !isStoredDeck(next.deck)
            || !next.cards.some((entry) => entry.membership?.starredAt != null);
        }
      }

      setAttrSafe(rootEl, "editMode", next.editMode ? "" : null);
      setAttrSafe(handleEl, "readingShelves", region("textbook-reader") ? "" : null);
      setAttrSafe(rootEl, "empty", next.browse || next.deck ? null : "");
      if (next.deck?.mode) stageEl.dataset.deckMode = next.deck.mode;
      else delete stageEl.dataset.deckMode;
    });

    let inflight = 0;
    const unsubLoad = ui.subscribe("content", (next, previous) => {
      if (next.deckId === previous.deckId && next.reload === previous.reload) return;
      const stamp = ++inflight;
      void loadDeckData(next.deckId).then((data) => {
        if (stamp === inflight) ui.transition("content/loaded", data);
      }).catch((error: unknown) => {
        if (stamp === inflight) showInlineError(errorMessage(error));
      });
    });

    // Scroll does not bubble: one capturing listener watches the reader (header) and the pager (tab).
    const settlePager = (pager: HTMLElement): void => {
      window.clearTimeout(pagerSettleTimer);
      pagerSettleTimer = undefined;
      if (pager.dataset.dragging !== undefined || !pager.clientWidth) return;
      const pages = [...pager.querySelectorAll<HTMLElement>(".chapter-page")];
      const tab = pages[Math.round(pager.scrollLeft / pager.clientWidth)]?.dataset.tab as StarredTab | undefined;
      if (tab && tab !== ui.get("content").starredTab) ui.transition("content/select-tab", { tab });
    };
    const listeners = new AbortController();
    meatEl.addEventListener("scroll", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.region === "textbook-reader") {
        if (!headerFrame) headerFrame = requestAnimationFrame(() => { headerFrame = 0; updateCollapse(); });
      } else if (target.dataset.region === "chapter-pager") {
        window.clearTimeout(pagerSettleTimer);
        pagerSettleTimer = window.setTimeout(() => settlePager(target), 140);
      }
    }, { capture: true, passive: true, signal: listeners.signal });
    meatEl.addEventListener("scrollend", (event) => {
      if (event.target instanceof HTMLElement && event.target.dataset.region === "chapter-pager") settlePager(event.target);
    }, { capture: true, signal: listeners.signal });

    rootEl.addEventListener("pointerdown", (event) => {
      if (event.target instanceof Element && !event.target.closest(".chapter-menu, .chapter-sheet-switch")) closeMenu(false);
    }, { signal: listeners.signal });

    rootEl.addEventListener("keydown", (event) => {
      const sheet = region("chapter-sheet");
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (event.key === "Escape") {
        if (sheet?.classList.contains(MENU_OPEN_CLASS)) { event.preventDefault(); closeMenu(true); return; }
        if (ui.get("content").chapterKey !== null) { event.preventDefault(); ui.transition("content/close-chapter"); }
        return;
      }
      if (target?.matches(".chapter-menu-item") && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const items = [...target.parentElement!.querySelectorAll<HTMLElement>(".chapter-menu-item")];
        const index = items.indexOf(target);
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[nextIndex]?.focus();
      } else if (target?.matches(".chapter-tab") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const tabs = [...target.parentElement!.querySelectorAll<HTMLElement>(".chapter-tab")];
        const index = tabs.indexOf(target);
        const nextTab = tabs[event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
        const tab = nextTab?.dataset.tab as StarredTab | undefined;
        if (!nextTab || !tab) return;
        ui.transition("content/select-tab", { tab });
        alignPager(ui.get("content"), "smooth");
        nextTab.focus();
      }
    }, { signal: listeners.signal });

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

    delegate.register("content/menu-settings", () => {
      const { deck, cards } = ui.get("content");
      if (isStoredDeck(deck)) {
        ui.transition("action/open", { kind: "settings", payload: { deck, cards } });
      }
    });

    delegate.register("content/menu-edit", () => ui.transition("content/enter-edit"));

    delegate.register("content/open-chapter", (_event, element) => {
      const { chapterKey, tab, focus } = element.dataset;
      if (!chapterKey) return;
      if (ui.get("content").chapterKey === null) sheetOpener = element;
      ui.transition("content/open-chapter", { chapterKey, tab: tab as StarredTab | undefined });
      if (ui.get("content").chapterKey !== chapterKey) return;
      closeMenu(false);
      if (tab) alignPager(ui.get("content"), "auto");
      const [kind, id] = focus?.split(/:(.*)/s) ?? [];
      if (!id) return;
      // Family and topic sections scroll into place; an exchange also flashes.
      const attribute = kind === "family" ? "data-family-id" : kind === "topic" ? "data-topic-id" : kind === "exchange" ? "data-exchange-id" : null;
      if (attribute) reveal(`[${attribute}="${CSS.escape(id)}"]`, kind === "exchange");
    });

    delegate.register("content/close-chapter", () => ui.transition("content/close-chapter"));

    delegate.register("content/toggle-chapter-menu", () => {
      if (region("chapter-sheet")?.classList.contains(MENU_OPEN_CLASS)) closeMenu(true);
      else openMenu();
    });

    delegate.register("content/select-tab", (_event, element) => {
      const tab = element.dataset.tab as StarredTab | undefined;
      if (!tab) return;
      ui.transition("content/select-tab", { tab });
      alignPager(ui.get("content"), "smooth");
    });

    delegate.register("content/open-in-context", (_event, element) => {
      const entry = ui.get("content").cards.find((candidate) => candidate.key === element.dataset.entryKey);
      if (!entry) return;
      const chapterKey = entryChapterKey(entry);
      ui.transition("content/open-chapter", { chapterKey });
      if (ui.get("content").chapterKey !== chapterKey) return;
      alignPager(ui.get("content"), "auto");
      reveal(`.card-row-wrapper[data-entry-key="${CSS.escape(entry.key)}"]`, true);
    });

    delegate.register("content/done", (_event, element) => {
      const slice = ui.get("content");
      if (!slice.editMode || !slice.editOrder || !isStoredDeck(slice.deck)) return;
      const deckId = slice.deck.id;
      const version = ownerVersion;
      const order = [...slice.editOrder];
      const button = element instanceof HTMLButtonElement ? element : null;
      if (button) button.disabled = true;
      showInlineError(null);
      void updateDeckEntryOrder(deckId, order).then(() => {
        if (!isCurrentOwner(version)) return;
        const current = ui.get("content");
        if (isStoredDeck(current.deck)
          && current.deck.id === deckId
          && current.editMode) {
          ui.transition("content/confirm-edit");
        }
      }).catch((error: unknown) => {
        if (!isCurrentOwner(version)) return;
        const current = ui.get("content");
        if (isStoredDeck(current.deck) && current.deck.id === deckId) {
          showInlineError(errorMessage(error));
        }
      }).finally(() => {
        if (isCurrentOwner(version) && button?.isConnected) button.disabled = false;
      });
    });

    delegate.register("content/review", (_event, element) => {
      const slice = ui.get("content");
      if (!isStoredDeck(slice.deck)) return;
      const deck = slice.deck;
      const version = ownerVersion;
      const button = element instanceof HTMLButtonElement ? element : null;
      if (button) button.disabled = true;
      void getReviewCards(deck.id).then((cards) => {
        if (!isCurrentOwner(version)) return;
        const current = ui.get("content");
        if (!isStoredDeck(current.deck) || current.deck.id !== deck.id || cards.length === 0) {
          return;
        }
        ui.transition("action/open", { kind: "review", payload: { deck, cards } });
      }).catch((error: unknown) => {
        if (!isCurrentOwner(version)) return;
        const current = ui.get("content");
        if (isStoredDeck(current.deck) && current.deck.id === deck.id) {
          showInlineError(errorMessage(error));
        }
      }).finally(() => {
        if (isCurrentOwner(version) && button?.isConnected) {
          const current = ui.get("content");
          button.disabled = !isStoredDeck(current.deck)
            || current.deck.id !== deck.id
            || !current.cards.some((entry) => entry.membership?.starredAt != null);
        }
      });
    });

    delegate.register("content/browse-back", () => ui.transition("content/browse-back"));

    delegate.register("content/browse-select", (_event, element) => {
      const id = element.dataset.deckId;
      if (!id) return;
      // Language collections are virtual and have no persisted deck to timestamp.
      if (!id.startsWith("lang:")) void updateDeckAccessTime(id);
      ui.transition("content/select-deck", { id });
    });

    delegate.register("content/cancel-edit", () => ui.transition("content/cancel-edit"));

    const unregisterCardActions = registerCardActions({ host, rootEl, isEdit });
    const registeredActions = [
      "content/menu",
      "content/menu-settings",
      "content/menu-edit",
      "content/open-chapter",
      "content/close-chapter",
      "content/toggle-chapter-menu",
      "content/select-tab",
      "content/open-in-context",
      "content/done",
      "content/review",
      "content/browse-back",
      "content/browse-select",
      "content/cancel-edit",
    ];

    return () => {
      if (disposed) return;
      disposed = true;
      inflight += 1;
      ownerVersion += 1;
      unsubContent();
      unsubLoad();
      unregisterCardActions();
      gestures.dispose();
      listeners.abort();
      cancelAnimationFrame(headerFrame);
      window.clearTimeout(pagerSettleTimer);
      handleEl.removeAttribute("data-reading-shelves");
      for (const action of registeredActions) delegate.unregister(action);
    };
  },
};

export default contentPane;
