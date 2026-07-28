import { FONT_BODY } from '@/utils/Constants';
import { Button, FlexContainer, PopupConfig, PopupId, defineScene } from '@caperjs/core';

import BaseScene from '@/scenes/BaseScene';

export const scene = defineScene({
  id: 'ui-popup',
  debug: {
    group: 'UI',
    label: 'Popups',
    order: 2,
  },
});

export default class PopupScene extends BaseScene {
  protected readonly title = 'Popups';
  protected readonly subtitle =
    'Open a popup by clicking a button.\nThe' + ' different popups have different behaviors.';
  protected buttons: Button[] = [];
  protected buttonContainer: FlexContainer;

  public async initialize() {
    await super.initialize();
    this.app.func.setActionContext('game');
    this.app.focus.addFocusLayer(this.id);

    // Popups are now auto-registered from discovery (src/popups/). No
    // addPopup() calls needed — just reference the discovered ids.

    this.app.popups.onHidePopup.connect((detail) => {
      if (detail.id === 'confirm') {
        console.log(`[PopupScene] Confirm popup closed — user picked: ${detail.data?.choice ?? 'unknown'}`);
      }
    });

    this.buttonContainer = this.add.flexContainer({
      gap: 10,
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      label: 'Popup Buttons',
      x: this.app.size.width,
    });

    this.addButton('Example', () => {
      this.app.action('show_popup', {
        id: 'example',
        data: { title: `Example Popup` },
      });
    });
    this.addButton('No ESC Close', () =>
      this.app.action('show_popup', {
        id: 'example',
        data: { title: `Example Popup:\nWon't close on ESC` },
        closeOnEscape: false,
      }),
    );
    this.addButton('No Outside Close', () =>
      this.app.action('show_popup', {
        id: 'example',
        data: { title: "Example Popup:\nWon't close on click outside" },
        closeOnPointerDownOutside: false,
        backing: { color: 'red' },
      }),
    );
    this.addButton('Confirm', () =>
      this.app.action('show_popup', {
        id: 'confirm',
        data: { title: 'Confirm Popup' },
      }),
    );
  }

  public async start() {
    this.app.focus.add(this.buttons, this.id, true);
  }

  addButton(label: string = 'Button', callback: () => void) {
    const btn = this.buttonContainer.add.button({
      scale: 0.5,
      cursor: 'pointer',
      textures: { default: 'btn/blue', hover: 'btn/yellow', disabled: 'btn/grey', active: 'btn/red' },
      sheet: 'ui',
      accessibleTitle: label,
      accessibleHint: `Press me to show a popup`,
      layout: { width: 256, height: 70 },
      label,
    });

    btn.addLabel({
      text: label,
      anchor: 0.5,
      resolution: 2,
      style: { fill: 0xffffff, fontFamily: FONT_BODY, fontWeight: 'bold', fontSize: 48, align: 'center' },
    });

    this.addSignalConnection(btn.onClick.connect(callback));

    this.buttons.push(btn);

    btn.label = label;

    return btn;
  }

  showPopup(
    popupId: PopupId,
    config: Partial<PopupConfig> = {
      backing: { color: 0x222222 },
      data: { title: `Example Popup ${popupId}` },
    },
  ) {
    this.app.popups.show(popupId, config);
  }

  resize() {
    super.resize();
    this.buttonContainer.layoutWidth = this.app.size.width;
    this.buttonContainer.x = -this.app.size.width * 0.5;
    this.buttonContainer.y = -this.buttonContainer.height * 0.5;
  }
}
