import type * as Actual from '../../js/api-identity';

// No Firebase, sign-in or app verification in stories; the fixture transport ignores these tokens.
export const getApiCredentials: typeof Actual.getApiCredentials = signal =>
  signal?.aborted
    ? Promise.reject(new DOMException('Aborted', 'AbortError'))
    : Promise.resolve({ identityToken: 'storybook-identity', appCheckToken: 'storybook-app-check' });

export const invalidateApiCredentials: typeof Actual.invalidateApiCredentials = () => {};
