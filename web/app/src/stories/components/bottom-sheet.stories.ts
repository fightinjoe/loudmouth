import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { openBottomSheet } from '../../components/bottom-sheet';
import { appStory, getScenario, logScenarioEvent } from '../support/scenario';

interface SheetArgs { size: 'hug' | 'full'; scrollable: boolean }
const meta = {
  title: 'Components/BottomSheet', tags: ['autodocs'],
  args: { size: 'hug', scrollable: false },
  argTypes: {
    size: { control: 'inline-radio', options: ['hug', 'full'], description: 'Production sheet height contract; hug fits content, full fills the available sheet region.' },
    scrollable: { control: 'boolean', description: 'Populate a long minimal body to inspect independent sheet scrolling.' },
  },
  parameters: { docs: { description: { component: 'src/components/bottom-sheet.ts · openBottomSheet. Production hug/full sheet ownership and gestures, with minimal specimen content (not a copied compound panel). Drag the handle/header down to dismiss. Action sheets currently animate even with reduced motion and do not implement details-style Escape/focus trapping. Reset scenario reopens dismissed specimens.' } } },
} satisfies Meta<SheetArgs>;
export default meta;
type Story = StoryObj<SheetArgs>;

function sheet(size: 'hug' | 'full' = 'hug', scrollable = false, finish?: 'close' | 'dispose'): Story {
  let currentSize = size;
  let currentScrollable = scrollable;
  const scenario = appStory({ library: 'empty', mount(root) {
    const handle = openBottomSheet(root, {
      kind: currentSize === 'full' ? 'review' : 'settings', size: currentSize,
      bodyHTML: '<header class="pane-header"><h2 class="text-header">Sheet specimen</h2><button type="button" class="icon-button" data-sheet-close aria-label="Close specimen">Close</button></header>' +
        `<div class="overflow-y-auto flex-1">${Array.from({ length: currentScrollable ? 60 : 1 }, (_, i) => `<p class="text-body1">${currentScrollable ? `Scrollable production sheet body · ${i + 1}` : 'Use Close, the scrim, or a downward handle swipe.'}</p>`).join('')}</div>`,
      onMount(panel, _scrim, close) { panel.querySelector('[data-sheet-close]')!.addEventListener('click', close); },
      onDispose: () => logScenarioEvent('Sheet resources disposed'),
      onClose: () => logScenarioEvent('Sheet dismissed'),
    });
    if (finish === 'close') handle.close();
    if (finish === 'dispose') handle.dispose();
    return () => handle.dispose();
  } });
  return { ...scenario, args: { size, scrollable }, render(args) {
    currentSize = args.size;
    currentScrollable = args.scrollable;
    return scenario.render();
  } };
}

function swipe(target: Element, dx: number, dy: number, cancel = false): void {
  const dispatch = (type: string, x: number, y: number) => {
    const point = { clientX: x, clientY: y };
    const touches = Object.assign([point], { item: () => point });
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: touches } });
    target.dispatchEvent(event);
  };
  dispatch('touchstart', 100, 100); dispatch('touchmove', 100 + dx, 100 + dy);
  dispatch(cancel ? 'touchcancel' : 'touchend', 100 + dx, 100 + dy);
}

export const Hug: Story = sheet();
export const Full: Story = sheet('full');
export const ScrollableBody: Story = sheet('full', true);
export const ExplicitClose: Story = { ...sheet(), play: async () => {
  const { root } = getScenario();
  await userEvent.click(root.querySelector('[data-sheet-close]')!);
  await waitFor(() => expect(root.querySelector('.bottom-sheet')).toBeNull());
} };
export const ScrimClose: Story = { ...sheet(), play: async () => {
  const { root } = getScenario();
  await userEvent.click(root.querySelector('.deck-settings-scrim')!);
  await waitFor(() => expect(root.querySelector('.bottom-sheet')).toBeNull());
} };
export const HeaderSwipeClose: Story = { ...sheet(), play: async () => {
  const { root } = getScenario();
  swipe(root.querySelector('.bottom-sheet .pane-header')!, 2, 120);
  await waitFor(() => expect(root.querySelector('.bottom-sheet')).toBeNull());
} };
export const ShortHorizontalCancelledSwipe: Story = { ...sheet(), play: async () => {
  const { root } = getScenario();
  const handle = root.querySelector('.sheet-handle')!;
  swipe(handle, 0, 30); swipe(handle, 130, 20); swipe(handle, 0, 130, true);
  expect(root.querySelector('.bottom-sheet')).not.toBeNull();
  expect(root.querySelector<HTMLElement>('.bottom-sheet')!.style.transform).toBe('');
  logScenarioEvent('Short, horizontal and cancelled gestures retain sheet');
} };
export const CloseBeforeOpen: Story = { ...sheet('hug', false, 'close'), play: async () => {
  expect(getScenario().root.querySelector('.bottom-sheet')).toBeNull();
} };
export const ImmediateOwnerDisposal: Story = { ...sheet('hug', false, 'dispose'), play: async () => {
  expect(getScenario().root.querySelector('.bottom-sheet')).toBeNull();
  expect(getScenario().root.querySelector('.deck-settings-scrim')).toBeNull();
} };
