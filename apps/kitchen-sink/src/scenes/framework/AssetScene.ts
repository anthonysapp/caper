import BaseScene from '@/scenes/BaseScene';
import { CaperColors } from '@/theme';
import CaperPanel from '@/ui/CaperPanel';
import { FONT_BODY } from '@/utils/Constants';
import { FlexContainer, defineScene } from '@caper/core';
import { Text } from 'pixi.js';

const CARDS: AssetCard[] = [
  {
    alias: 'caper',
    src: '',
    label: 'Game Sprite',
    method: 'PNG · game bundle',
    displaySize: 120,
  },
  {
    alias: 'staticCaperLogo',
    src: '/static/caper.png',
    label: 'Static PNG',
    method: 'PNG · alias',
    displaySize: 120,
  },
  {
    alias: 'required/caper.png',
    src: '',
    label: 'Required Bundle',
    method: 'PNG · required bundle',
    displaySize: 120,
  },
];

export const scene = defineScene({
  id: 'assets',
  debug: {
    group: 'Framework',
    label: 'Assets',
  },
  assets: {
    preload: {
      assets: [{ alias: 'staticCaperLogo', src: '/static/caper.png' }],
    },
  },
});

interface AssetCard {
  alias: string;
  src: string;
  label: string;
  method: string;
  /** Display size to use instead of reading texture dimensions (SVGs have no intrinsic size). */
  displaySize: number;
}

const CARD_W = 200;
const CARD_PAD = 16; // bottom padding below the method label

export default class AssetScene extends BaseScene {
  title = 'Assets';
  subtitle = 'Loading sprites from different sources and formats';
  container: FlexContainer;

  public async initialize() {
    await super.initialize();
    this.container = this.add.flexContainer({
      layout: {
        gap: 24,
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
      },
      label: 'Card Container',
    });

    for (const card of CARDS) {
      this.addCard(card);
    }
  }

  private addCard(card: AssetCard): void {
    // Content layout: heading area (40px) + sprite + gap (8px) + label (~16px) + padding
    const spriteY = 60;
    const labelY = spriteY + card.displaySize / 2 + 8;
    const cardH = labelY + 16 + CARD_PAD + 40; // 40 = heading offset from contentContainer

    const panel = new CaperPanel({
      width: CARD_W,
      height: cardH,
      heading: card.label,
    });

    const sprite = this.add.sprite({
      asset: card.alias,
      anchor: 0.5,
    });
    sprite.width = card.displaySize;
    sprite.height = card.displaySize;
    sprite.position.set((CARD_W - 32) / 2, spriteY);
    panel.contentContainer.addChild(sprite);

    const methodLabel = new Text({
      text: card.method,
      style: {
        fontFamily: FONT_BODY,
        fontSize: 12,
        fontWeight: '500',
        fill: CaperColors.textDim,
      },
    });
    methodLabel.anchor.set(0.5, 0);
    methodLabel.position.set((CARD_W - 32) / 2, labelY);
    panel.contentContainer.addChild(methodLabel);

    this.container.add.existing(panel, {
      layout: {
        width: CARD_W,
        height: cardH,
        flexGrow: 0,
        flexShrink: 0,
        applySizeDirectly: true,
      },
    });
  }

  resize() {
    super.resize();
    if (this.container) {
      this.container.size = [this.app.size.width, this.app.size.height - 120];
      this.container.position.set(-this.app.size.width * 0.5, -this.app.size.height * 0.5);
    }
  }
}
