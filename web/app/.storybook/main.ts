import type { StorybookConfig } from '@storybook/html-vite';
import { fileURLToPath } from 'node:url';
import isolatedViteConfig from './vite.config.ts';

const config: StorybookConfig = {
  framework: {
    name: '@storybook/html-vite',
    options: { builder: { viteConfigPath: fileURLToPath(new URL('./vite.config.ts', import.meta.url)) } },
  },
  stories: ['../src/stories/**/*.stories.ts'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  staticDirs: ['../public'],
  viteFinal(config) {
    // Storybook drops user build options except target before this final hook.
    config.build = { ...config.build, commonjsOptions: isolatedViteConfig.build?.commonjsOptions };
    return config;
  },
};
export default config;
