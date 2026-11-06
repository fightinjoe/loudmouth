import type { Deck } from '../js/library-types';
import { LANG_FLAGS, LANG_NAMES } from '../js/lang';
import { escapeHTML } from '../js/utils';

export interface BookOptions {
  deck: Pick<Deck, 'id' | 'name' | 'lang' | 'illustration'>;
  subtitle: string;
}

/** One library shelf tile; its owner handles navigation and artwork errors. */
export function renderBook({ deck, subtitle }: BookOptions): string {
  const art = deck.illustration?.state === 'ready'
    ? `<img class="nav-book-art" src="${escapeHTML(deck.illustration.image.dataUrl)}" alt="" loading="lazy" decoding="async">` : '';
  return `<button type="button" class="nav-book" data-action="nav/open-deck" data-deck-id="${escapeHTML(deck.id)}">
      <span class="nav-book-meta"><strong>${escapeHTML(deck.name)}</strong><small>${escapeHTML(LANG_FLAGS[deck.lang])} ${escapeHTML(LANG_NAMES[deck.lang])}</small><small>${escapeHTML(subtitle)}</small></span>
      <span class="nav-book-thumbnail" aria-hidden="true">${art}</span>
    </button>`;
}

/** Register on the tile owner in capture phase: image errors do not bubble. */
export function handleBookImageError(event: Event): void {
  const image = event.target;
  if (image instanceof HTMLImageElement && image.classList.contains('nav-book-art')) image.dataset.failed = 'true';
}
