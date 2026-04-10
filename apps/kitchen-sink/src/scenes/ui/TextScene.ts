import { FONT_BODY, FONT_LEGACY_BITMAP } from '@/utils/Constants';
import { FlexContainer, Size, defineScene } from '@caper/core';
import BaseScene from '../BaseScene';

export const scene = defineScene({
  id: 'text',
  debug: {
    label: 'Text',
    group: 'UI',
    order: 0,
  },
});

export default class TextScene extends BaseScene {
  public title = 'Text';
  public subtitle = 'Various text implementations';

  private textContainer: FlexContainer;

  async initialize() {
    super.initialize();

    this.textContainer = this.add.flexContainer({
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 30,
      bindToAppSize: true,
      label: 'Text Container',
    });

    const text = this.textContainer.add.text({
      text: 'Text (using a web font)',
      style: {
        fontFamily: FONT_BODY,
        fontSize: 48,
        leading: -10,
        textBaseline: 'bottom',
      },
      layout: {
        isLeaf: true,
      },
    });

    this.textContainer.add.htmlText({
      text: 'HTML text with <strong>bold</strong>, <em>italic</em>, <u>underline</u>, <s>strikethrough</s>, and <span style="color:white; background-color: black">some</span> <span style="color: #8ac733">different</span> <span style="color: pink">colors</span>.',
      style: {
        align: 'center',
        fontFamily: FONT_BODY,
        wordWrapWidth: 500,
        wordWrap: true,
        fontSize: 32,
      },
    });

    text.pivot.y = -25;

    this.textContainer.add.bitmapText({
      text: 'Bitmap Font',
      style: {
        fontFamily: FONT_LEGACY_BITMAP,
        fontSize: 64,
      },
    });
  }

  resize(size?: Size): void {
    super.resize(size);
    this.textContainer.x = -this.app.size.width / 2;
    this.textContainer.y = -this.app.size.height / 2;
  }
}
