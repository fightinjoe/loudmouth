import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import Dexie from 'dexie';
import type { Lang } from '@catchphrase/card-schema';
import { db } from '../../js/db';
import { ABILITY_QUESTION } from '../../js/ability';
import { setLastAbility, setLastCreationLanguage } from '../../js/preferences';
import { appStory, getScenario, logScenarioEvent, onScenarioCleanup, trackScenarioWork, type ScenarioOptions } from '../support/scenario';
import { contextResponse, FIXTURE_LANGUAGES } from '../support/fixtures';
import { requests, setOutcome, setResponseFactory } from '../support/transport';

export type CreationArgs = { lang?: Lang; seed?: string };
const seed = 'Ordering at a café';
const description = 'Source: src/components/creation-panel.ts — openCreationPanel, mounted through the real action owner. Screens are reached with public actions and DOM controls; no private creation state or copied templates. API fixtures pass the unchanged client validators, and committing keeps the real 1000 ms minimum. Reset scenario opens a fresh controller; Resolve/Fail settle pending transport. Other retains the current placeholder wording, whitespace topic submission is a no-op, and action sheets currently lack the details pane’s Escape/focus trap.';

const meta = {
  title: 'Components/Creation',
  tags: ['autodocs'],
  excludeStories: /^creation/,
  parameters: { layout: 'fullscreen', docs: { description: { component: description }, story: { inline: false } } },
  argTypes: {
    lang: { control: 'select', options: [undefined, ...FIXTURE_LANGUAGES], description: 'Optional initial content language. Unset performs the real saved-library lookup.' },
    seed: { control: 'text', description: 'Initial situation text; editing or changing language uses the production invalidation rules.' },
  },
} satisfies Meta<CreationArgs>;
export default meta;
type Story = StoryObj<CreationArgs>;

/** Shared by the creation catalog and executable journeys; not a CSF story. */
export function creationScenario(options: ScenarioOptions = {}, initial: CreationArgs = { lang: 'ja', seed }) {
  let params = initial;
  const scenario = appStory({
    library: 'empty',
    ...options,
    mount(root, data, app) {
      const dispose = options.mount?.(root, data, app);
      app.ui.transition('action/open', { kind: 'creation', payload: params });
      return dispose;
    },
  });
  return {
    ...scenario,
    render(args: CreationArgs = {}) {
      params = { ...initial, ...Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined)) };
      return scenario.render();
    },
  };
}

/** Queries are scoped to the current sandbox root, including the action layer. */
export async function creationElement<T extends HTMLElement = HTMLElement>(selector: string): Promise<T> {
  let element: T | null = null;
  await waitFor(() => {
    element = getScenario().root.querySelector<T>(selector);
    expect(element).not.toBeNull();
  }, { timeout: 8000 });
  return element!;
}

export async function creationClick(action: string): Promise<void> {
  await userEvent.click(await creationElement(`[data-action="creation/${action}"]`));
}

export async function creationAnswer(value?: string): Promise<void> {
  const selector = '[data-action="creation/answer"]' + (value === undefined ? '' : `[value="${CSS.escape(value)}"]`);
  await userEvent.click(await creationElement(selector));
  await creationClick('next-question');
}

export async function creationSubmitTopic(topic?: string): Promise<void> {
  const input = await creationElement<HTMLTextAreaElement>('.creation-input-field');
  if (topic !== undefined) {
    await userEvent.clear(input);
    await userEvent.type(input, topic);
  }
  await creationClick('submit-topic');
}

/** Advances only through rendered controls, respecting optional remembered ability. */
export async function creationReachChecklist(): Promise<void> {
  await creationSubmitTopic();
  await creationElement('[data-action="creation/answer"]');
  for (let question = 0; question < 6; question += 1) {
    if (getScenario().root.querySelector('.creation-checklist')) return;
    const label = getScenario().root.querySelector('.creation-question-label')?.textContent;
    await creationAnswer(label === ABILITY_QUESTION ? 'Basics' : undefined);
  }
  await creationElement('.creation-checklist');
}

export async function creationCommit(doubleClick = false): Promise<string> {
  const previous = new Set((await db.decks.toArray()).map((deck) => deck.id));
  const submit = await creationElement('[data-action="creation/submit-context"]');
  if (doubleClick) await userEvent.dblClick(submit);
  else await userEvent.click(submit);
  let id = '';
  await waitFor(async () => {
    const added = (await db.decks.toArray()).filter((deck) => !previous.has(deck.id));
    expect(added).toHaveLength(1);
    id = added[0]!.id;
    expect(getScenario().app.ui.get('content').deckId).toBe(id);
  }, { timeout: 8000 });
  await creationElement('#content-pane [data-region="textbook-reader"]');
  logScenarioEvent('Creation committed', id);
  return id;
}

const docs = (text: string) => ({ docs: { description: { story: text } } });

export const FirstLanguage: Story = {
  ...creationScenario({}, {}),
  parameters: docs('First-use language choice. All five supported languages remain on this screen until explicit Next; no generation request occurs on selection.'),
  play: async () => { await creationElement('[data-action="creation/language"]'); },
};

let releaseLibrary: (() => void) | undefined;
export const Initializing: Story = {
  ...creationScenario({
    setup: async () => {
      let entered!: () => void;
      const started = new Promise<void>((resolve) => { entered = resolve; });
      const gate = new Promise<void>((resolve) => { releaseLibrary = resolve; });
      onScenarioCleanup(() => { releaseLibrary?.(); releaseLibrary = undefined; });
      trackScenarioWork(db.transaction('rw', db.decks, async () => {
        await db.decks.count();
        entered();
        await Dexie.waitFor(gate, 2_147_483_647);
      }));
      await started;
    },
    mount: (root) => {
      const button = document.createElement('button');
      button.textContent = 'Release library read';
      button.addEventListener('click', () => { releaseLibrary?.(); button.remove(); });
      root.parentElement?.querySelector('.workbench-actions')?.append(button);
      return () => { releaseLibrary?.(); button.remove(); };
    },
  }, {}),
  parameters: docs('The real initializing screen, held by a genuine sandbox Dexie transaction—not a private state override. Use Release library read in the workbench tools to continue. Owner cleanup releases the transaction.'),
  play: async () => { await creationElement('.creation-wait-body'); },
};

export const ReturningTopic: Story = {
  ...creationScenario({ library: 'single', setup: () => { setLastCreationLanguage('ja'); setLastAbility('ja', 'basics'); } }, {}),
  parameters: docs('Saved library lookup remembers Japanese and Basics. Initial situation and language are semantic Controls; changing either remounts only this sandbox scene.'),
  play: async () => { await creationElement('.creation-input-field'); },
};

export const LanguageEdit: Story = {
  ...creationScenario(),
  parameters: docs('Language editing retains the situation. Back cancels a pending language; Next confirms it and invalidates the previous context.'),
  play: async () => { await creationClick('edit-language'); },
};

export const ContextWait: Story = {
  ...creationScenario({ outcomes: { '/context': 'pending' } }),
  parameters: docs('Pending context request. Resolve/Fail uses the real HTTP and validation path; Cancel aborts the request.'),
  play: async () => { await creationSubmitTopic(); await creationElement('.creation-generating'); },
};

export const ContextError: Story = {
  ...creationScenario({ outcomes: { '/context': 'error' } }),
  parameters: docs('HTTP context failure. Retry returns to the retained topic; submitting it performs a fresh context request.'),
  play: async () => { await creationSubmitTopic(); expect(await creationElement('.creation-panel [role="alert"]')).toBeVisible(); setOutcome('/context', 'success'); },
};

export const AbilityQuestion: Story = {
  ...creationScenario(),
  parameters: docs('Client-owned None/Basics/Conversational question; ability is not remembered until successful atomic persistence.'),
  play: async () => { await creationSubmitTopic(); await creationElement('[data-action="creation/answer"]'); },
};

export const GeneratedQuestions: Story = {
  ...creationScenario({ setup: () => { setLastAbility('ja', 'basics'); } }),
  parameters: docs('Remembered ability omits the client-owned question. Company and Setting come from a valid context response.'),
  play: async () => { await creationSubmitTopic(); await creationElement('.creation-other-input'); },
};

export const OtherAnswer: Story = {
  ...creationScenario({ setup: () => { setLastAbility('ja', 'basics'); } }),
  parameters: docs('Other is a real radio/input choice. Typing stores a trimmed answer; Enter advances only when nonblank. Existing placeholder wording is retained.'),
  play: async () => {
    await creationSubmitTopic();
    await userEvent.type(await creationElement('.creation-other-input'), '  Colleagues after work  ');
  },
};

export const ChecklistPending: Story = {
  ...creationScenario({ outcomes: { '/phrasebook': 'pending' } }),
  parameters: docs('Checklist stays editable while speculative generation is pending. Toggle choices without another request; Continue waits for Resolve plus the real minimum delay.'),
  play: async () => { await creationReachChecklist(); },
};

export const ChecklistReady: Story = {
  ...creationScenario(),
  parameters: docs('Speculative response is ready but nothing is saved until Continue. All generated topics are requested once; only selected topics are committed.'),
  play: async () => {
    await creationReachChecklist();
    await waitFor(() => expect(requests.find((request) => request.endpoint === '/phrasebook')?.status).toBe('success'));
    expect(await db.decks.count()).toBe(0);
  },
};

export const GenerationWait: Story = {
  ...creationScenario({ outcomes: { '/phrasebook': 'pending' } }),
  parameters: docs('Explicit Continue enters the cancellable generation wait. Resolve does not bypass the real 1000 ms minimum or atomic commit.'),
  play: async () => { await creationReachChecklist(); await creationClick('submit-context'); await creationElement('.creation-generating'); },
};

export const GenerationErrorAndRetry: Story = {
  ...creationScenario({ outcomes: { '/phrasebook': 'error' } }),
  parameters: docs('Background generation failure is deferred until Continue. Try again starts fresh generation and restores the retained checklist choices; the next fixture response succeeds.'),
  play: async () => {
    await creationReachChecklist();
    await waitFor(() => expect(requests.find((request) => request.endpoint === '/phrasebook')?.status).toBe('error'));
    await creationClick('submit-context');
    expect(await creationElement('.creation-panel [role="alert"]')).toBeVisible();
    setOutcome('/phrasebook', 'success');
  },
};

export const ZeroQuestionResponseRejected: Story = {
  ...creationScenario({ setup: () => {
    setLastAbility('ja', 'basics');
    setResponseFactory('/context', () => ({ ...contextResponse(), questions: [] }));
  } }),
  parameters: docs('Contract limitation: validateContextResult requires 1–5 questions. The controller-only zero-question route cannot be reached by a valid real response, so this specimen exposes validator rejection instead of bypassing validation. Existing zero-question Retry returns to the topic.'),
  play: async () => { await creationSubmitTopic(); expect(await creationElement('.creation-panel [role="alert"]')).toBeVisible(); },
};
