import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import { getReviewCards } from '../../js/db';
import { appStory, getScenario, logScenarioEvent, onScenarioCleanup, replaceScenarioProperty } from '../support/scenario';
import { requests, resolvePending } from '../support/transport';

const meta = {
  title: 'Interactions/Lifecycle',
  parameters: {
    docs: { description: { component: 'Real pane controllers mounted through src/panes/app.ts:mountApp. Disconnect/reconnect exercises the same disposal boundary used when Storybook replaces a Canvas or Controls rerenders. Reconnection retains sandbox persistence; Reset scenario reseeds it.' } },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

async function reconnect(): Promise<void> {
  const { root } = getScenario();
  const host = root.parentElement!;
  const parent = host.parentElement!;
  host.remove();
  parent.append(host);
  await waitFor(() => expect(getScenario().root.querySelector('.textbook-chapter')).toBeInTheDocument());
}

export const PendingCreationReplacement: Story = {
  ...appStory({ library: 'single', initial: 'textbook', outcomes: { '/context': 'pending', '/phrasebook-title': 'pending' } }),
  play: async () => {
    const { app, root } = getScenario();
    app.ui.transition('action/open', { kind: 'creation', payload: { lang: 'ja', seed: 'A quiet café' } });
    await userEvent.click(within(root).getByRole('button', { name: 'Prepare my phrasebook' }));
    await waitFor(() => expect(requests.some(request => request.endpoint === '/context' && request.status === 'pending')).toBe(true));
    await reconnect();
    expect(requests.filter(request => request.endpoint === '/context' || request.endpoint === '/phrasebook-title').every(request => request.status === 'aborted')).toBe(true);
    resolvePending();
    expect(getScenario().app.ui.get('action')).toBeNull();
    expect(getScenario().root.querySelector('.creation-panel')).not.toBeInTheDocument();
    logScenarioEvent('PASS', 'Pending creation aborted; replacement remains the textbook');
  },
};

export const PendingBreakdownReplacement: Story = {
  ...appStory({ library: 'single', initial: 'textbook', outcomes: { '/phrase-breakdown': 'pending' } }),
  play: async () => {
    await waitFor(() => expect(getScenario().root.querySelector('.card-term')).toBeInTheDocument());
    const opener = getScenario().root.querySelector<HTMLElement>('.card-term')!;
    opener.focus();
    await fireEvent.keyDown(opener, { key: 'F10', shiftKey: true });
    await waitFor(() => expect(requests.some(request => request.endpoint === '/phrase-breakdown' && request.status === 'pending')).toBe(true));
    await reconnect();
    expect(requests.find(request => request.endpoint === '/phrase-breakdown')?.status).toBe('aborted');
    resolvePending();
    expect(getScenario().app.ui.get('details')).toBeNull();
    expect(getScenario().root.querySelector('#app-shell')).not.toHaveAttribute('inert');
    logScenarioEvent('PASS', 'Pending details aborted and background inertness released');
  },
};

export const ReviewPeekReplacement: Story = {
  ...appStory({ library: 'single', initial: 'textbook', starred: true }),
  play: async () => {
    let current = getScenario();
    const cards = await getReviewCards(current.data.deck!.id);
    current.app.ui.transition('action/open', { kind: 'review', payload: { deck: current.data.deck!, cards } });
    const skeleton = current.root.querySelector<HTMLElement>('.review-answer-skeleton')!;
    expect(skeleton).toBeInTheDocument();
    await fireEvent.mouseDown(skeleton);
    await reconnect();
    current = getScenario();
    current.app.ui.transition('action/open', { kind: 'review', payload: { deck: current.data.deck!, cards } });
    await fireEvent.mouseUp(document);
    expect(current.root.querySelectorAll('.review-panel')).toHaveLength(1);
    expect(current.root.querySelector('.review-card-wrap')).toHaveAttribute('data-revealed', 'false');
    logScenarioEvent('PASS', 'Old peek release cannot reveal or close the replacement Review');
  },
};

export const PendingClipboardReplacement: Story = {
  ...appStory({ library: 'single', initial: 'textbook' }),
  play: async () => {
    let settle!: () => void;
    const copy = new Promise<void>(resolve => { settle = resolve; });
    onScenarioCleanup(settle);
    replaceScenarioProperty(navigator, 'clipboard', { value: { writeText: () => copy } });
    let current = getScenario();
    current.app.ui.transition('action/open', { kind: 'json', payload: { title: 'Old export', jsonString: '{"old":true}' } });
    await userEvent.click(within(current.root).getByRole('button', { name: 'Copy' }));
    await reconnect();
    current = getScenario();
    current.app.ui.transition('action/open', { kind: 'json', payload: { title: 'Replacement export', jsonString: '{"replacement":true}' } });
    settle();
    await copy;
    expect(within(current.root).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(current.root.querySelector('textarea')).toHaveValue('{"replacement":true}');
    logScenarioEvent('PASS', 'Late clipboard completion cannot alter replacement export');
  },
};

export const RepeatedMountOwnership: Story = {
  ...appStory({ library: 'single', initial: 'textbook' }),
  play: async () => {
    for (let index = 0; index < 3; index += 1) await reconnect();
    const { root, app } = getScenario();
    await userEvent.click(within(root).getByRole('button', { name: 'Library' }));
    expect(app.ui.get('shell').exposed).toBe('background');
    expect(root.querySelectorAll('#nav-pane')).toHaveLength(1);
    expect(root.querySelectorAll('#content-pane')).toHaveLength(1);
    logScenarioEvent('PASS', 'Three remounts retain one pane and one click owner');
  },
};
