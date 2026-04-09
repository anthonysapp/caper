import { definePopup, Popup } from '@caper/core';

export const popup = definePopup({
  id: 'confirm',
  active: true,
});

export default class ConfirmPopup extends Popup {}
