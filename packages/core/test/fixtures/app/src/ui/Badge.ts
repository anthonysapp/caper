import { Container, defineUI } from '@caperjs/core';

// NOTE: the explicit `id` export is what discovery actually reads. The
// `defineUI({ id })` form is silently ignored — `findExportedConstants` flattens
// wrapper exports for 'scene', 'plugin', 'popup' and 'entity' but not 'ui', so a
// UI element registers under its class name instead. Tracked as a follow-up in
// plan/vite-preset-rework.md; fixing it changes every app's uiList ids.
export const id = 'badge';
export const ui = defineUI({ id: 'badge' });

export default class Badge extends Container {}
