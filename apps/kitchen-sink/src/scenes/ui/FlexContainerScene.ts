import { FONT_BODY } from '@/utils/Constants';
import { AlignItems, clamp, FlexContainer, FlexDirection, FlexWrap, JustifyContent, defineScene } from '@caperjs/core';
import { TextStyleOptions } from 'pixi.js';

import BaseScene from '@/scenes/BaseScene';
import { GUIController } from 'dat.gui';

export const scene = defineScene({
  id: 'flex-container',
  debug: {
    group: 'UI',
    label: 'Flex Container',
    order: 3,
  },
});

const whiteTextStyle = (size: number): Partial<TextStyleOptions> => ({
  fontFamily: FONT_BODY,
  fontWeight: 'bold',
  fill: 0xffffff,
  fontSize: size ?? 24,
});

export default class FlexContainerScene extends BaseScene {
  protected readonly title = 'Flex Container';
  protected readonly subtitle = 'Demonstrates the FlexContainer layout.';
  protected config = {
    debug: true,
    width: 800,
    height: 200,
    numItems: 4,
    varySizes: false,
    gap: 10,
    flexWrap: 'nowrap',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    nested: false,
  };
  protected flexContainer: FlexContainer;
  protected widthUI: GUIController;
  protected heightUI: GUIController;

  configureGUI() {
    this.gui
      .add(this.config, 'debug')
      .onChange((value: boolean) => {
        this.flexContainer.debug = value;
      })
      .name('Debug');

    this.widthUI = this.gui.add(this.config, 'width', 0, 2000, 1).onChange(() => {
      this.addItems();
    });

    this.heightUI = this.gui.add(this.config, 'height', 0, 2000, 1).onChange(() => {
      this.addItems();
    });

    this.gui
      .add(this.config, 'numItems', 1, 20, 1)
      .onChange(() => {
        this.addItems();
      })
      .name('Number of items');

    this.gui
      .add(this.config, 'varySizes')
      .onChange(() => {
        this.addItems();
      })
      .name('Vary sizes');

    this.gui.add(this.config, 'gap', 0, 100, 1).onChange(() => {
      this.flexContainer.gap = this.config.gap;
    });

    this.gui.add(this.config, 'flexWrap', ['nowrap', 'wrap']).onChange(() => {
      this.flexContainer.flexWrap = this.config.flexWrap as 'nowrap' | 'wrap';
    });

    this.gui.add(this.config, 'flexDirection', ['row', 'column']).onChange(() => {
      this.flexContainer.flexDirection = this.config.flexDirection as 'row' | 'column';
    });

    this.gui.add(this.config, 'alignItems', ['flex-start', 'center', 'flex-end']).onChange(() => {
      this.flexContainer.alignItems = this.config.alignItems as 'center' | 'flex-start' | 'flex-end';
    });

    this.gui
      .add(this.config, 'justifyContent', [
        'flex-start',
        'center',
        'flex-end',
        'space-between',
        'space-around',
        'space-evenly',
      ])
      .onChange(() => {
        this.flexContainer.justifyContent = this.config.justifyContent as JustifyContent;
      });

    this.gui
      .add(this.config, 'nested')
      .onChange(() => {
        this.addItems();
      })
      .name('Nested');
  }

  async initialize() {
    await super.initialize();

    this.flexContainer = this.add.flexContainer({
      debug: this.config.debug,
      label: 'FlexContainer Demo',
      position: [-this.config.width * 0.5, -this.config.height * 0.5],
      gap: this.config.gap,
      flexDirection: this.config.flexDirection as FlexDirection,
      flexWrap: this.config.flexWrap as FlexWrap,
      justifyContent: this.config.justifyContent as JustifyContent,
      alignItems: this.config.alignItems as AlignItems,
      layout: {
        width: this.config.width,
        height: this.config.height,
      },
    });

    this.addItems();
  }

  resize() {
    super.resize();
  }

  addItems() {
    const { numItems, varySizes } = this.config;
    const width = this.config.width;
    const height = this.config.height;

    this.flexContainer.removeChildren();
    this.flexContainer.size = [width, height];
    this.flexContainer.position.set(-width * 0.5, -height * 0.5);

    Array.from({ length: numItems }).forEach((_, i) => {
      if (this.config.nested && numItems > 1 && i === 1) {
        const nested: FlexContainer = this.flexContainer.add.flexContainer({
          flexDirection: this.config.flexDirection === 'row' ? 'column' : 'row',
          gap: 10,
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
        });
        Array.from({ length: numItems }).forEach((_, n) => {
          nested.add.text({ text: `Nested ${n + 1}`, resolution: 2, style: whiteTextStyle(24) });
        });
      }
      this.flexContainer.add.text({
        text: `Item ${i + 1}`,
        resolution: 2,
        style: whiteTextStyle(varySizes ? clamp(Math.random() * 48 + 24, 24, 72) : 48),
      });
    });

    // Force immediate layout pass after all items are in place
    this.flexContainer.updateLayout();
    this.resize();
  }
}
