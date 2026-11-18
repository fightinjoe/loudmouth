import type * as Actual from '../../js/api-config';
import { API_PREFIX } from './transport';

// Stories never read build inputs: requests go to the same-origin fixture transport.
export const getApiConfiguration: typeof Actual.getApiConfiguration = () => ({
  apiUrl: API_PREFIX,
  identity: {
    firebase: { apiKey: 'storybook', authDomain: 'storybook.invalid', projectId: 'storybook', appId: 'storybook' },
    siteKey: 'storybook',
  },
});
