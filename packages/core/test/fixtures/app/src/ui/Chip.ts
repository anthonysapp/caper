import { Container, defineUI } from '@caperjs/core';

// Deliberately not named `ui`: the flatten step keys on the value being a
// define* call, not on the export's name.
export const ui_ = defineUI({ id: 'chip' });

export default class Chip extends Container {}
