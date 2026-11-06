import { uuid } from '../../js/utils';

// Each preview document owns its storage, even on the same origin as the app.
export const DATABASE_NAME = `catchphrase-storybook.${uuid()}`;
export const SESSION_PREFIX = `${DATABASE_NAME}.`;
export const PREFERENCE_PREFIX = SESSION_PREFIX;
export const BREAKDOWN_CACHE_PREFIX = `${SESSION_PREFIX}phrase-breakdown.v1:`;
