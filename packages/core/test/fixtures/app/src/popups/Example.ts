import { definePopup, Popup } from '@caperjs/core';

export const popup = definePopup({ id: 'example', active: true });

export default class Example extends Popup {}
