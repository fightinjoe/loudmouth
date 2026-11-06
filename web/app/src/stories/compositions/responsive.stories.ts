import type { Meta, StoryObj } from '@storybook/html-vite';
import { updateDeckName, updateDeckReadingDisplay } from '../../js/db';
import { appStory, logScenarioEvent, type ScenarioOptions } from '../support/scenario';
import { LONG_TITLE } from '../support/fixtures';

const meta = {
  title: 'Compositions/Responsive', tags: ['autodocs'], argTypes: {},
  parameters: { layout: 'fullscreen', docs: { description: { component: 'src/styles/components.css (#app-shell), textbook-content.css and textbook-navigation.css under src/panes/app.ts: mountApp. Native production widths, fixed layers and independent scroll containers; no scaled screenshots or cloned templates. Viewport globals set Canvas dimensions. Browser zoom and physical accessibility text sizing still need device review.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function scene(viewport: string, options: ScenarioOptions = {}): Story {
  return { ...appStory({ library: 'single', initial: 'textbook', ...options }), globals: { viewport: { value: viewport, isRotated: false } } };
}
export const Narrow = scene('narrow');
export const Mobile = scene('mobile');
export const Desktop = scene('desktop');
export const MaximumAppWidth: Story = {
  ...scene('appWidth'),
  parameters: { viewport: { options: { appWidth: { name: 'App maximum · 480px', styles: { width: '480px', height: '900px' } } } }, docs: { description: { story: '480px viewport matches the production #app-shell maximum width; no app constraint is overridden.' } } },
};
export const ShortViewport: Story = { ...scene('narrow'), globals: { viewport: { value: 'narrow', isRotated: true } } };
export const LongTitle = scene('narrow', { setup: async ({ deck }) => { await updateDeckName(deck!.id, LONG_TITLE); } });
export const EnlargedText: Story = {
  ...scene('mobile', { setup: async ({ deck }) => { await updateDeckName(deck!.id, LONG_TITLE); }, mount: () => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = '125%';
    return () => { document.documentElement.style.fontSize = previous; };
  } }),
  parameters: { docs: { description: { story: '125% root-font specimen with long persisted title. This changes the root font only, preserving component rules; fixed-pixel text does not scale, so this is not a claim of full browser-zoom or OS Dynamic Type coverage.' } } },
};
export const JapaneseNative = scene('mobile', { lang: 'ja' });
export const JapaneseRomanized = scene('mobile', { lang: 'ja', setup: async ({ deck }) => { await updateDeckReadingDisplay(deck!.id, 'romanization'); } });
export const ChineseRuby = scene('mobile', { lang: 'zh' });
export const CzechDiacritics = scene('narrow', { lang: 'cs' });
export const UkrainianCyrillic = scene('narrow', { lang: 'uk' });
export const Spanish = scene('mobile', { lang: 'es' });
export const ReducedMotion: Story = {
  ...scene('mobile'),
  parameters: { docs: { description: { story: 'Use the actual browser/system reduced-motion setting. Details and reorder transitions honor it; action sheets retain their current animation. No production animation styles are overridden.' } } },
  play: async () => { logScenarioEvent('Actual reduced-motion preference', String(matchMedia('(prefers-reduced-motion: reduce)').matches)); },
};
