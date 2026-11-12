import type { Meta, StoryObj } from '@storybook/html-vite';
import { renderCardRow, renderRuby } from '../../components/card';
import { renderPhrasebookTitle } from '../../components/phrasebook-title';
import { renderCategoryCard } from '../../components/chapter-card';
import { renderChapterSheetBody } from '../../components/chapter-sheet';
import { escapeHTML } from '../../js/utils';
import { fixtureEntry, textFixtureEntry, LONG_TEXT } from '../support/fixtures';
import { categoryChapter, contextFor, fixtureBook } from '../support/chapters';
import { mountedStory } from '../support/mounted-story';

function typography(multilingual = false): HTMLElement {
  return mountedStory((host) => {
    host.className = 'workbench-gallery';
    const book = fixtureBook();
    const words = categoryChapter(book, 'words');
    const utilities = ['text-h1', 'text-entry', 'text-h2', 'text-header', 'text-card-title', 'text-body-lg', 'text-body1', 'text-body2', 'section-label', 'font-light', 'font-medium', 'font-semibold', 'font-bold', 'font-mono', 'leading-entry'];
    host.innerHTML = `<h1 class="text-h2">Typography in the final theme</h1><p class="workbench-caption">Computed family, size, weight and line-height; remote Google Fonts must load for visual parity. Measurements describe CSS, not proof of successful font download.</p>${!multilingual ? utilities.map((name) => `<section class="workbench-specimen"><div class="${name}" data-measure=".${name}">Tea, please. Čaj, prosím. Чай, будь ласка.</div></section>`).join('') : ''}<div id="content-pane" style="max-width:480px;min-width:0"><div data-region="content-body" style="position:relative;height:260px;overflow:hidden">${renderPhrasebookTitle(book.deck.name, { leading: '', trailing: '' })}</div><div class="chapter-cards">${renderCategoryCard(words)}</div><div class="chapter-sheet-body">${renderChapterSheetBody(words, { readingDisplay: 'reading', readOnly: false, tab: 'words', contextFor: contextFor(book) })}</div><div class="deck-view-list">${[
      ['Japanese native / ruby', renderCardRow(fixtureEntry(), 'reading')],
      ['Japanese romanization', renderCardRow(fixtureEntry(), 'romanization')],
      ['Chinese ruby', renderCardRow(fixtureEntry('phrase', 'zh'), 'reading')],
      ['Czech', renderCardRow(fixtureEntry('phrase', 'cs'))],
      ['Ukrainian', renderCardRow(fixtureEntry('phrase', 'uk'))],
      ['Long wrapping text', renderCardRow(textFixtureEntry('long'))],
    ].map(([label, html]) => `<section class="workbench-specimen"><p class="workbench-caption">${label}</p>${html}</section>`).join('')}</div></div><section><span class="text-entry" data-measure="renderRuby / .text-entry">${renderRuby(fixtureEntry('phrase', 'zh').card.reading)}</span></section><section><label>JSON export typography<textarea class="json-pane-textarea flex-1 surface-field text-area-fixed text-body2 font-mono leading-entry" readonly spellcheck="false" rows="5" data-measure="JSON: .json-pane-textarea.text-body2.font-mono.leading-entry">${escapeHTML(JSON.stringify({ text: 'お茶 / Чай / Čaj', note: '<literal> & quoted' }, null, 2))}</textarea></label></section><p class="text-body1" data-measure=".text-body1 long text">${escapeHTML(LONG_TEXT)}</p><section data-metrics><h2 class="text-h2">Measured production styles</h2></section>`;
    const metrics = host.querySelector('[data-metrics]')!;
    const selectors = '[data-measure], .phrasebook-title, .phrasebook-minibar span, .chapter-card-glyph, .chapter-card-name, .chapter-card-count, .chapter-card-open, .deck-card-label, .deck-card-target, .deck-card-english, .deck-card-foot, .chapter-group-title, .chapter-group-context, .card-term-target, .card-term-english, .card-term-definition, #content-pane rt';
    const seen: Record<string, true> = {};
    for (const element of host.querySelectorAll<HTMLElement>(selectors)) {
      const name = element.dataset.measure ?? (element.className || element.tagName.toLowerCase());
      if (seen[name]) continue;
      seen[name] = true;
      const style = getComputedStyle(element);
      const row = document.createElement('p');
      row.className = 'workbench-caption';
      row.textContent = `${name}: ${style.fontFamily}; ${style.fontSize}; weight ${style.fontWeight}; line-height ${style.lineHeight}`;
      metrics.append(row);
    }
    return () => {};
  });
}
const meta = { title: 'Foundations/Typography', tags: ['autodocs'], parameters: { docs: { description: { component: 'src/styles/utilities.css, components.css, textbook-content.css; renderPhrasebookTitle, renderCategoryCard, renderChapterSheetBody, renderCardRow and renderRuby provide actual production typography contexts. JSON uses the production text-body2/font-mono classes. No font sizes are copied into the stories.' } } }, render: () => typography() } satisfies Meta;
export default meta;
type Story = StoryObj;
export const UtilityAndPhrasebookStyles: Story = {};
export const MultilingualAndLongText: Story = { render: () => typography(true) };
