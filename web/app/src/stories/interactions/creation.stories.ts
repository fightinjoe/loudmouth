import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import { db, getGroups } from '../../js/db';
import { ABILITY_QUESTION } from '../../js/ability';
import { getLastAbility, getLastCreationLanguage, setLastAbility, setLastCreationLanguage } from '../../js/preferences';
import { contextResponse, FIXTURE_TITLE, FIXTURE_TOPICS } from '../support/fixtures';
import { getScenario, logScenarioEvent } from '../support/scenario';
import { allowLateResponse, failPending, requests, resolvePending, setOutcome, setResponseFactory, type Endpoint } from '../support/transport';
import { creationAnswer, creationClick, creationCommit, creationElement, creationReachChecklist, creationScenario, creationSubmitTopic, type CreationArgs } from '../components/creation.stories';
import { activeChapterPage, phrasebookLanding, settledChapterSheet } from '../support/phrasebook';

const meta = {
  title: 'Interactions/Creation',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
    docs: { story: { inline: false }, description: { component: 'Executable journeys through src/components/creation-panel.ts via the real app action owner, src/js/phrasebook-api.ts validators and sandbox Dexie transactions. No private view state, artificial clocks, live generation, or audible speech. The production 1000 ms minimum is preserved. Reset scenario resets data and reopens creation; rerun interactions to replay the journey. Named completion and transport events remain in the workbench log.' } },
  },
  argTypes: {},
} satisfies Meta<CreationArgs>;
export default meta;
type Story = StoryObj<CreationArgs>;
const docs = (text: string) => ({ docs: { description: { story: text } } });
const count = (endpoint: Endpoint) => requests.filter((request) => request.endpoint === endpoint).length;
const request = async (endpoint: Endpoint, status: 'pending' | 'success' | 'error' | 'aborted' = 'success') => {
  await waitFor(() => expect(requests.some((entry) => entry.endpoint === endpoint && entry.status === status && entry.body !== null)).toBe(true), { timeout: 8000 });
};
const checkedLabels = () => [...getScenario().root.querySelectorAll<HTMLElement>('[data-action="creation/toggle-checklist-item"][aria-pressed="true"]')].map((row) => row.textContent?.trim());
const noBook = async () => { expect(await db.decks.count()).toBe(0); };
const closed = async () => { await waitFor(() => expect(getScenario().root.querySelector('.creation-panel')).toBeNull(), { timeout: 3000 }); };
const finished = (name: string) => logScenarioEvent('Journey complete', name);

export const FirstTimeAtomicSave: Story = {
  ...creationScenario({}, {}),
  parameters: docs('Choose language without auto-advance, enter a topic, answer ability and generated questions, trim Other with Enter, retain Previous/Next answers, select only desired chapters, and double-Continue. No deck or remembered ability exists before commit. The real atomic commit stores only selected groups, exactly once.'),
  play: async () => {
    await userEvent.click(await creationElement('[data-action="creation/language"][value="ja"]'));
    expect(getScenario().root.querySelector('.creation-input-field')).toBeNull();
    expect(count('/context')).toBe(0);
    await creationClick('next-language');
    await creationSubmitTopic('Ordering at a café');
    await creationElement('[data-action="creation/answer"]');
    expect(getScenario().root.querySelector('.creation-question-label')).toHaveTextContent(ABILITY_QUESTION);
    await creationAnswer('Basics');
    const other = await creationElement<HTMLInputElement>('.creation-other-input');
    await userEvent.type(other, '   ');
    expect(await creationElement('[data-action="creation/next-question"]')).toBeDisabled();
    await userEvent.type(other, 'Colleagues   {Enter}');
    await creationClick('previous-question');
    expect(await creationElement('.creation-other-input')).toHaveValue('Colleagues');
    expect(await creationElement('[data-action="creation/other"]')).toBeChecked();
    await creationClick('next-question');
    await creationAnswer();
    await creationElement('.creation-checklist');
    await userEvent.click(await creationElement('[data-action="creation/toggle-checklist-item"][data-index="1"]'));
    await userEvent.click(await creationElement('[data-action="creation/toggle-checklist-item"][data-index="2"]'));
    expect(checkedLabels()).toEqual([FIXTURE_TOPICS[0], FIXTURE_TOPICS[2]]);
    await request('/phrasebook');
    expect(count('/phrasebook')).toBe(1);
    await noBook();
    expect(getLastAbility('ja')).toBeUndefined();
    const started = performance.now();
    const id = await creationCommit(true);
    expect(performance.now() - started).toBeGreaterThanOrEqual(1000);
    expect(await db.decks.count()).toBe(1);
    expect((await getGroups(id)).map((group) => group.title)).toEqual([FIXTURE_TOPICS[0], FIXTURE_TOPICS[2]]);
    expect((await db.decks.get(id))?.generation?.answers.Company).toBe('Colleagues');
    expect(getLastAbility('ja')).toBe('basics');
    expect(count('/phrasebook')).toBe(1);
    finished('First-time atomic selected-topic save');
  },
};

export const ReturningLanguageEdit: Story = {
  ...creationScenario({ library: 'single', outcomes: { '/phrasebook': 'pending' }, setup: () => { setLastCreationLanguage('ja'); setLastAbility('ja', 'conversational'); } }, { seed: 'Dinner with friends' }),
  parameters: docs('Remembered language/ability, known-ability omission, prompt preservation, Back cancelling a tentative language, and confirming another language. Back to the topic invalidates obsolete speculative work before the new language request. Zero-question success is not fabricated: the unchanged API validator requires 1–5 questions; see ZeroQuestionContractBoundary.'),
  play: async () => {
    expect(await creationElement('.creation-input-field')).toHaveValue('Dinner with friends');
    await creationSubmitTopic();
    await creationElement('.creation-other-input');
    expect(getScenario().root.querySelector('.creation-question-label')).not.toHaveTextContent(ABILITY_QUESTION);
    await creationAnswer();
    await creationAnswer();
    await request('/phrasebook', 'pending');
    await creationClick('back');
    await creationClick('previous-question');
    await creationClick('previous-question');
    await creationClick('edit-language');
    await userEvent.click(await creationElement('[data-action="creation/language"][value="cs"]'));
    await creationClick('back');
    expect(await creationElement('.creation-input-field')).toHaveValue('Dinner with friends');
    expect(getLastCreationLanguage()).toBe('ja');
    await creationClick('edit-language');
    await userEvent.click(await creationElement('[data-action="creation/language"][value="cs"]'));
    await creationClick('next-language');
    await request('/phrasebook', 'aborted');
    expect(getLastCreationLanguage()).toBe('cs');
    expect(await creationElement('.creation-input-field')).toHaveValue('Dinner with friends');
    await creationSubmitTopic();
    await creationElement('[data-action="creation/answer"]');
    expect(getScenario().root.querySelector('.creation-question-label')).toHaveTextContent(ABILITY_QUESTION);
    expect(requests.filter((entry) => entry.endpoint === '/context').map(({ body }) => {
      if (!body || typeof body !== 'object' || !('language' in body)) throw new Error('Context request is missing its language');
      return body.language;
    })).toEqual(['ja', 'cs']);
    expect(count('/phrasebook-title')).toBe(2);
    finished('Remembered settings and confirmed language invalidation');
  },
};

export const ZeroQuestionContractBoundary: Story = {
  ...creationScenario({ setup: () => {
    setLastAbility('ja', 'basics');
    setResponseFactory('/context', () => ({ ...contextResponse(), questions: [] }));
  } }),
  parameters: docs('The controller contains a zero-question route, but real validateContextResult requires 1–5 questions. This journey intentionally sends zero through the unchanged validator and asserts the visible failure and topic retry instead of falsely claiming reachable success.'),
  play: async () => {
    await creationSubmitTopic();
    expect(await creationElement('.creation-panel [role="alert"]')).toBeVisible();
    await noBook();
    expect(count('/phrasebook')).toBe(0);
    await creationClick('retry');
    expect(await creationElement('.creation-input-field')).toHaveValue('Ordering at a café');
    finished('Zero-question response rejected by production contract');
  },
};

export const SpeculationReuseAndReplacement: Story = {
  ...creationScenario({ outcomes: { '/phrasebook': 'pending' } }),
  parameters: docs('Pending and ready speculative responses keep the checklist usable. Toggles and Back/Next without edits reuse one request. Changing an answer aborts pending work and creates a fresh request; changed ready work is replaced too. Nothing is saved without Continue.'),
  play: async () => {
    await creationReachChecklist();
    await request('/phrasebook', 'pending');
    await userEvent.click(await creationElement('[data-action="creation/toggle-checklist-item"][data-index="2"]'));
    await creationClick('back');
    await creationClick('next-question');
    expect(count('/phrasebook')).toBe(1);
    await creationClick('back');
    await creationAnswer('A busy takeaway counter');
    await waitFor(() => expect(count('/phrasebook')).toBe(2));
    expect(requests.filter((entry) => entry.endpoint === '/phrasebook')[0]?.status).toBe('aborted');
    resolvePending('/phrasebook');
    await request('/phrasebook');
    await userEvent.click(await creationElement('[data-action="creation/toggle-checklist-item"][data-index="2"]'));
    await creationClick('back');
    await creationClick('next-question');
    expect(count('/phrasebook')).toBe(2);
    await creationClick('back');
    await creationAnswer('A quiet café');
    await waitFor(() => expect(count('/phrasebook')).toBe(3));
    resolvePending('/phrasebook');
    await noBook();
    finished('Speculative reuse, pending abort and ready replacement');
  },
};

export const BackgroundFailureAndRetry: Story = {
  ...creationScenario({ outcomes: { '/phrasebook': 'pending' } }),
  parameters: docs('A background failure does not replace the checklist. Continue exposes it; Retry makes a fresh request and preserves selected chapters and answers. The retry commits successfully without requesting context again.'),
  play: async () => {
    await creationReachChecklist();
    await userEvent.click(await creationElement('[data-action="creation/toggle-checklist-item"][data-index="2"]'));
    const selected = checkedLabels();
    failPending('/phrasebook');
    await request('/phrasebook', 'error');
    expect(await creationElement('.creation-checklist')).toBeVisible();
    expect(within(getScenario().root).queryByRole('alert')).toBeNull();
    await creationClick('submit-context');
    expect(await creationElement('.creation-panel [role="alert"]')).toBeVisible();
    setOutcome('/phrasebook', 'success');
    await creationClick('retry');
    expect(checkedLabels()).toEqual(selected);
    await waitFor(() => expect(count('/phrasebook')).toBe(2));
    await creationCommit();
    expect(count('/context')).toBe(1);
    finished('Background failure surfaced and retried with retained choices');
  },
};

export const ContextFailureAndRetry: Story = {
  ...creationScenario({ outcomes: { '/context': 'error' } }),
  parameters: docs('Real HTTP context failure, retained topic on Retry, and a new successful context request. No settings inline-error UI or alternate error renderer is introduced.'),
  play: async () => {
    await creationSubmitTopic();
    expect(await creationElement('.creation-panel [role="alert"]')).toBeVisible();
    setOutcome('/context', 'success');
    await creationClick('retry');
    expect(await creationElement('.creation-input-field')).toHaveValue('Ordering at a café');
    await creationReachChecklist();
    expect(count('/context')).toBe(2);
    await noBook();
    finished('Context failure and retry');
  },
};

async function dismiss(method: 'button' | 'scrim' | 'swipe'): Promise<void> {
  if (method === 'button') await creationClick('cancel');
  else if (method === 'scrim') await userEvent.click(await creationElement('.creation-scrim'));
  else {
    const handle = await creationElement('.creation-panel .sheet-handle');
    const point = (y: number) => new Touch({ identifier: 1, target: handle, clientX: 120, clientY: y });
    fireEvent.touchStart(handle, { touches: [point(20)], changedTouches: [point(20)] });
    fireEvent.touchMove(handle, { touches: [point(140)], changedTouches: [point(140)] });
    fireEvent.touchEnd(handle, { touches: [], changedTouches: [point(140)] });
  }
  await closed();
}

function cancellation(endpoint: '/context' | '/phrasebook', method: 'button' | 'scrim' | 'swipe'): Story {
  return {
    ...creationScenario({ outcomes: { [endpoint]: 'pending', '/phrasebook-image': 'pending' } }),
    parameters: docs(`Cancel ${endpoint === '/context' ? 'context' : 'generation'} through the real ${method} dismissal path. Transport observes the AbortSignal, unbound illustration is cancelled, and no book is persisted. Swipe dispatches touch events at the production header threshold; physical-device/native scrolling acceptance is separate.`),
    play: async () => {
      if (endpoint === '/context') await creationSubmitTopic();
      else { await creationReachChecklist(); await creationClick('submit-context'); }
      await request(endpoint, 'pending');
      await dismiss(method);
      await request(endpoint, 'aborted');
      if (endpoint === '/phrasebook') await request('/phrasebook-image', 'aborted');
      await noBook();
      finished(`Cancelled ${endpoint} using ${method}`);
    },
  };
}

export const CancelContextButton: Story = cancellation('/context', 'button');
export const CancelContextScrim: Story = cancellation('/context', 'scrim');
export const CancelContextSwipe: Story = cancellation('/context', 'swipe');
export const CancelGenerationButton: Story = cancellation('/phrasebook', 'button');
export const CancelGenerationScrim: Story = cancellation('/phrasebook', 'scrim');
export const CancelGenerationSwipe: Story = cancellation('/phrasebook', 'swipe');

function lateCancellation(endpoint: '/context' | '/phrasebook'): Story {
  return {
    ...creationScenario({ outcomes: { [endpoint]: 'pending' }, setup: () => { allowLateResponse(endpoint); } }),
    parameters: docs('Adversarial late-result opt-in applies only to this request; normal fixtures honor AbortSignal. Resolve after dismissal must not save, reopen, start another generation, or replace a newer action.'),
    play: async () => {
      if (endpoint === '/context') await creationSubmitTopic();
      else { await creationReachChecklist(); await creationClick('submit-context'); }
      await request(endpoint, 'pending');
      await dismiss('button');
      getScenario().app.ui.transition('action/open', { kind: 'creation', payload: { lang: 'cs', seed: 'New owner' } });
      const input = await creationElement('.creation-input-field');
      resolvePending(endpoint);
      await request(endpoint);
      // ES2022 has no Promise.withResolvers; allow the real commit delay to elapse.
      if (endpoint === '/phrasebook') await new Promise<void>((resolve) => { window.setTimeout(resolve, 1100); });
      await waitFor(() => expect(input).toHaveValue('New owner'));
      await noBook();
      expect(getScenario().root.querySelectorAll('.creation-panel')).toHaveLength(1);
      if (endpoint === '/context') expect(count('/phrasebook')).toBe(0);
      finished(`Obsolete ${endpoint} result ignored`);
    },
  };
}
export const LateContextAfterCancel: Story = lateCancellation('/context');
export const LateGenerationAfterCancel: Story = lateCancellation('/phrasebook');

function titleJourney(outcome: 'success' | 'pending' | 'error'): Story {
  return {
    ...creationScenario({ outcomes: { '/phrasebook-title': outcome }, setup: () => { if (outcome === 'pending') allowLateResponse('/phrasebook-title'); } }),
    parameters: docs(`Title ${outcome}: ${outcome === 'success' ? 'a ready validated title names the saved book' : 'the original situation names the saved book without blocking creation'}. A title arriving after Continue cannot rename the frozen title or committed book.`),
    play: async () => {
      await creationReachChecklist();
      await request('/phrasebook-title', outcome);
      const id = await creationCommit();
      const expected = outcome === 'success' ? FIXTURE_TITLE : 'Ordering at a café';
      expect((await db.decks.get(id))?.name).toBe(expected);
      if (outcome === 'pending') {
        resolvePending('/phrasebook-title');
        await request('/phrasebook-title');
        expect((await db.decks.get(id))?.name).toBe(expected);
        expect(await creationElement('.phrasebook-title')).toHaveTextContent(expected);
      }
      finished(`Title ${outcome} naming policy`);
    },
  };
}
export const ReadyTitle: Story = titleJourney('success');
export const PendingAndLateTitle: Story = titleJourney('pending');
export const FailedTitleFallback: Story = titleJourney('error');

export const IllustrationReadyBeforeCommit: Story = {
  ...creationScenario(),
  parameters: docs('Cover response resolves while questions/checklist are open, before a durable owner exists. Continue binds that exact ready illustration to the newly committed book.'),
  play: async () => {
    await creationReachChecklist();
    await request('/phrasebook-image');
    await noBook();
    const id = await creationCommit();
    expect((await db.decks.get(id))?.illustration?.state).toBe('ready');
    expect(await creationElement('.textbook-cover')).toBeVisible();
    finished('Ready cover bound at commit');
  },
};

export const IllustrationFailureNonfatal: Story = {
  ...creationScenario({ outcomes: { '/phrasebook-image': 'error' } }),
  parameters: docs('A failed illustration remains nonfatal: text still commits and renders with the existing fallback cover.'),
  play: async () => {
    await creationReachChecklist();
    await request('/phrasebook-image', 'error');
    const id = await creationCommit();
    expect((await db.decks.get(id))?.illustration?.state).toBe('failed');
    expect(getScenario().root.querySelector('.textbook-cover')).toBeNull();
    expect(await creationElement('.textbook-pattern')).toBeVisible();
    finished('Artwork failure leaves usable persisted textbook');
  },
};

export const LateIllustrationPreservesReader: Story = {
  ...creationScenario({ library: 'single', outcomes: { '/phrasebook-image': 'pending' } }),
  parameters: docs('A committed pending cover may finish after the sheet closes. Only its owning book changes. All three topics are selected so the Words row overflows at every app width. Actual content controls open a category and enter reorder mode; the cover update preserves cards, focus, landing scroll and category row scroll, the open chapter and edit state.'),
  play: async () => {
    const previous = (await db.decks.toArray())[0]!;
    await creationReachChecklist();
    await userEvent.click(await creationElement('[data-action="creation/toggle-checklist-item"][data-index="2"]'));
    const id = await creationCommit();
    await closed();
    expect((await db.decks.get(id))?.illustration?.state).toBe('pending');
    const app = getScenario().app;
    const reader = await phrasebookLanding();
    await userEvent.click(reader.querySelector<HTMLElement>('.chapter-card[data-chapter-kind="category"] .chapter-card-header')!);
    await settledChapterSheet();
    await userEvent.click(await creationElement('.chapter-sheet-edit'));
    const row = activeChapterPage().querySelector<HTMLElement>('.card-row-wrapper')!;
    const focus = await creationElement<HTMLElement>('.chapter-sheet-done');
    focus.focus();
    const deckRow = reader.querySelector<HTMLElement>('.chapter-row')!;
    reader.scrollTop = 160;
    deckRow.scrollLeft = 70;
    // Let native scroll snapping settle before recording the positions to preserve.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const position = [reader.scrollTop, deckRow.scrollLeft];
    expect(position.every((value) => value > 0)).toBe(true);
    const state = app.ui.get('content');
    resolvePending('/phrasebook-image');
    await waitFor(async () => expect((await db.decks.get(id))?.illustration?.state).toBe('ready'));
    await creationElement('.textbook-cover');
    expect(row.isConnected).toBe(true);
    expect(document.activeElement).toBe(focus);
    expect([reader.scrollTop, deckRow.scrollLeft]).toEqual(position);
    expect(app.ui.get('content').chapterKey).toBe(state.chapterKey);
    expect(app.ui.get('content').editMode).toBe(true);
    expect(app.ui.get('content').editOrder).toEqual(state.editOrder);
    expect((await db.decks.get(previous.id))?.illustration).toEqual(previous.illustration);
    finished('Late cover preserves reader identity and interaction state');
  },
};

export const LateIllustrationOwnerReplacement: Story = {
  ...creationScenario({ outcomes: { '/phrasebook-image': 'pending' } }),
  parameters: docs('After commit, disconnect the actual lifecycle host and reconnect it to mount a new app/controller. Bound artwork may persist to its owning book; its obsolete UI callback must not alter the replacement creation screen or remount old cards. No manual app DOM or alternate controller is substituted.'),
  play: async () => {
    await creationReachChecklist();
    const id = await creationCommit();
    await closed();
    const oldRoot = getScenario().root;
    const oldApp = getScenario().app;
    const host = oldRoot.parentElement!;
    const parent = host.parentElement!;
    const next = host.nextSibling;
    host.remove();
    expect(oldRoot.querySelector('.creation-panel')).toBeNull();
    parent.insertBefore(host, next);
    const input = await creationElement('.creation-input-field');
    expect(getScenario().root).not.toBe(oldRoot);
    expect(getScenario().app).not.toBe(oldApp);
    await userEvent.clear(input);
    await userEvent.type(input, 'Replacement owner stays here');
    resolvePending('/phrasebook-image');
    await waitFor(async () => expect((await db.decks.get(id))?.illustration?.state).toBe('ready'));
    expect(input).toHaveValue('Replacement owner stays here');
    expect(input.isConnected).toBe(true);
    expect(oldRoot.children).toHaveLength(0);
    expect(getScenario().root.querySelectorAll('.creation-panel')).toHaveLength(1);
    expect(await db.decks.count()).toBe(1);
    finished('Bound cover persists without stale UI after owner replacement');
  },
};
