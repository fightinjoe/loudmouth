import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Lang } from '@catchphrase/card-schema';
import type { ReadingDisplay } from '../../js/library-types';
import type { DeckChapter, StarredTab, Topic } from '../../js/phrasebook-chapters';
import { renderChapterMenu, renderChapterSheet, renderChapterSheetBody } from '../../components/chapter-sheet';
import { FIXTURE_LANGUAGES, HOSTILE_TEXT, LONG_TITLE } from '../support/fixtures';
import { contextFor, fixtureBook, type FixtureBook } from '../support/chapters';
import { mountedStory } from '../support/mounted-story';

const CHAPTER_KEYS = ['category:words', 'category:phrases', 'category:exchanges', 'category:conversation', 'starred', 'translations', 'words', 'chunks'] as const;
type ChapterKey = typeof CHAPTER_KEYS[number];
type Empty = 'none' | 'entries' | 'topics';
type Args = { chapter: ChapterKey; tab: StarredTab; language: Lang; readings: ReadingDisplay; starred: boolean; empty: Empty; editable: boolean; editMode: boolean; readOnly: boolean; menuOpen: boolean; title: string };

function emptied(topic: Topic): Topic {
  return { ...topic, thingsToSay: [], exampleConversation: [],
    likelyExchanges: topic.likelyExchanges.map((exchange) => ({ ...exchange, turns: [] })),
    words: topic.words.map((family) => ({ ...family, entries: [] })) };
}

/** The book's chapters as the content owner would see them: optionally emptied, first topic optionally retitled. */
function chaptersFor(book: FixtureBook, args: Args): DeckChapter[] {
  const retitle = (topics: Topic[]): Topic[] => args.title ? topics.map((topic, index) => index === 0 ? { ...topic, title: args.title } : topic) : topics;
  return book.chapters.flatMap((chapter): DeckChapter[] => {
    if (chapter.kind === 'category') {
      const topics = args.empty === 'topics' ? [] : args.empty === 'entries' ? chapter.topics.map(emptied) : chapter.topics;
      return [{ ...chapter, topics: retitle(topics) }];
    }
    if (args.empty === 'none') return [chapter];
    return chapter.kind === 'starred' ? [{ ...chapter, entries: [] }] : [];
  });
}

/** Mirrors what the content owner does to the static shell: title, menu, body, open state. */
function sheet(args: Args): HTMLElement {
  return mountedStory((host) => {
    const fixture = fixtureBook({ lang: args.language, starred: args.starred });
    const book = { ...fixture, chapters: chaptersFor(fixture, args) };
    const chapter = book.chapters.find((candidate) => candidate.key === args.chapter) ?? book.chapters[0]!;
    host.className = 'workbench-gallery';
    host.innerHTML = `<div id="content-pane" data-chapter-open${args.editMode ? ' data-edit-mode' : ''} style="position:relative;width:100%;max-width:480px;height:min(760px,100dvh);overflow:hidden">
      <div data-region="content-body" style="height:100%">${renderChapterSheet({ editable: args.editable })}</div>
    </div><output class="workbench-caption" aria-live="polite">Renderer specimen: click a control to inspect its action payload; the content owner is not mounted, so nothing changes.</output>`;
    const section = host.querySelector<HTMLElement>('[data-region="chapter-sheet"]')!;
    section.dataset.chapterKind = chapter.kind;
    host.querySelector('[data-region="chapter-sheet-title"]')!.textContent = chapter.title;
    host.querySelector('[data-region="chapter-menu"]')!.innerHTML = renderChapterMenu(book.chapters, chapter.key);
    host.querySelector('[data-region="chapter-sheet-body"]')!.innerHTML = renderChapterSheetBody(chapter, {
      readingDisplay: args.readings, readOnly: args.readOnly, tab: args.tab, contextFor: contextFor(book),
    });
    if (args.menuOpen) {
      section.classList.add('chapter-sheet--menu-open');
      section.querySelector('.chapter-sheet-switch')!.setAttribute('aria-expanded', 'true');
    }
    const pager = host.querySelector<HTMLElement>('[data-region="chapter-pager"]')!;
    const align = (): void => {
      const pages = [...pager.querySelectorAll<HTMLElement>('.chapter-page')];
      pager.scrollLeft = Math.max(0, pages.findIndex((page) => !page.inert)) * pager.clientWidth;
    };
    const frame = requestAnimationFrame(align);
    const log = (event: Event): void => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
      if (target) host.querySelector('output')!.textContent = JSON.stringify(target.dataset);
    };
    host.addEventListener('click', log);
    return () => { cancelAnimationFrame(frame); host.removeEventListener('click', log); };
  });
}

const meta = {
  title: 'Components/ChapterSheet', tags: ['autodocs'],
  args: { chapter: 'category:words', tab: 'words', language: 'ja', readings: 'reading', starred: false, empty: 'none', editable: true, editMode: false, readOnly: false, menuOpen: false, title: '' },
  argTypes: {
    chapter: { control: 'select', options: CHAPTER_KEYS, description: 'Category chapter (one page covering every topic), Starred (Words and Phrases tabs), or a supplemental collection (one page). An absent chapter falls back to the first.' },
    tab: { control: 'radio', options: ['words', 'phrases'], description: 'Starred tab; every other chapter has one page and a hidden tab bar.' },
    language: { control: 'select', options: FIXTURE_LANGUAGES, description: 'Schema-valid authored specimen language.' },
    readings: { control: 'radio', options: ['reading', 'romanization'], description: 'Production ReadingDisplay mode for card rows.' },
    starred: { control: 'boolean', description: 'Star every membership: fills Starred and lists it first in the chapter menu.' },
    empty: { control: 'radio', options: ['none', 'entries', 'topics'], description: 'Remove every entry (families and exchanges keep their headings and say they are empty), or remove the topics too (each category shows its phrasebook-level empty message). Collections disappear either way.' },
    editable: { control: 'boolean', description: 'Stored phrasebooks render Reorder, Cancel and Done tools; previews do not.' },
    editMode: { control: 'boolean', description: 'Static #content-pane[data-edit-mode] header treatment; real reordering is in Interactions/Phrasebook.' },
    readOnly: { control: 'boolean', description: 'Preview rows without star controls.' },
    menuOpen: { control: 'boolean', description: 'Transient .chapter-sheet--menu-open class the content owner toggles.' },
    title: { control: 'text', description: 'Override the first topic title: a section heading in Key phrases/Conversation, the context line under Words families and Exchanges.' },
  },
  parameters: { docs: { description: { component: 'src/components/chapter-sheet.ts: renderChapterSheet (static shell), renderChapterMenu and renderChapterSheetBody, inside the actual #content-pane[data-chapter-open] ancestor. The story fills the title, menu and body regions the way src/panes/content-pane.ts does; chapters come from the real getDeckChapters over an in-memory projection of the three-topic fixture book. Inactive Starred pages are inert. Opening, revealing a section, Starred tabs and swiping, menu keyboard and Escape are exercised in Interactions/Phrasebook.' } } },
  render: (args: Args) => sheet(args),
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

export const Playground: Story = {};
export const WordsChapter: Story = { args: { chapter: 'category:words' }, parameters: { docs: { description: { story: 'Words: one pinned section per word family across every topic, headed by the family with its topic beneath.' } } } };
export const KeyPhrasesChapter: Story = { args: { chapter: 'category:phrases' }, parameters: { docs: { description: { story: 'Key phrases: one section per topic with Things to say as outlined cards.' } } } };
export const ExchangesChapter: Story = { args: { chapter: 'category:exchanges' }, parameters: { docs: { description: { story: 'Exchanges: one section per exchange with its topic beneath; speaker-aligned turns, alternatives inside a turn carry the "or" separator.' } } } };
export const ConversationChapter: Story = { args: { chapter: 'category:conversation' }, parameters: { docs: { description: { story: 'Conversation: one section per topic with speaker-aligned lines.' } } } };
export const StarredBody: Story = { args: { chapter: 'starred', starred: true, tab: 'phrases' }, parameters: { docs: { description: { story: 'Starred: Words and Phrases tabs; each item names its topic and family and links "In context". Reorder is hidden for Starred.' } } } };
export const CollectionBody: Story = { args: { chapter: 'translations' }, parameters: { docs: { description: { story: 'Supplemental collection: one page, tab bar hidden.' } } } };
export const EmptyEntries: Story = { args: { chapter: 'category:exchanges', empty: 'entries' }, parameters: { docs: { description: { story: 'Topics whose entries were all removed: word families and exchanges keep their headings with an empty message; Key phrases and Conversation (switch chapter) show their phrasebook-level message.' } } } };
export const EmptyTopics: Story = { args: { chapter: 'category:words', empty: 'topics' }, parameters: { docs: { description: { story: 'No topics at all: each category page shows its phrasebook-level empty message, and the menu still lists the open category.' } } } };
export const EmptyStarred: Story = { args: { chapter: 'starred', tab: 'words' }, parameters: { docs: { description: { story: 'Starred after its last star is removed: both tabs show their empty messages.' } } } };
export const ChapterMenu: Story = { args: { menuOpen: true, starred: true }, parameters: { docs: { description: { story: 'Open chapter menu: Starred first while anything is starred, then the categories with content (glyph markers) and collections; the current chapter is checked.' } } } };
export const EditModeHeader: Story = { args: { editMode: true, chapter: 'category:phrases' }, parameters: { docs: { description: { story: 'Edit mode: Cancel and Done replace Reorder, and the chapter switcher is disabled.' } } } };
export const PreviewReadOnly: Story = { args: { editable: false, readOnly: true, chapter: 'category:phrases' }, parameters: { docs: { description: { story: 'Unsaved preview: no reorder tools and no star controls.' } } } };
export const LongAndHostileTitle: Story = { args: { chapter: 'category:phrases', title: `${LONG_TITLE} ${HOSTILE_TEXT}` }, parameters: { docs: { description: { story: 'A long, literal hostile topic title stays escaped and wraps in its pinned section heading (switch to Words or Exchanges to see it as the one-line, ellipsized context line); the switcher keeps the fixed category title.' } } } };
