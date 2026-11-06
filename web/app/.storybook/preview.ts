import type { Preview } from '@storybook/html-vite';
import '../src/styles/app.css';
import '../src/stories/support/workbench.css';
import { installTransport } from '../src/stories/support/transport';

installTransport();

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: false, height: '844px' } },
    options: { storySort: { order: ['Foundations', 'Components', 'Compositions', 'Interactions'] } },
    viewport: {
      options: {
        mobile: { name: 'Mobile', styles: { width: '390px', height: '844px' } },
        narrow: { name: 'Narrow', styles: { width: '320px', height: '640px' } },
        desktop: { name: 'Desktop', styles: { width: '1280px', height: '900px' } },
      },
    },
  },
};
export default preview;
