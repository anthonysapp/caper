import { FlexContainer, defineScene } from '@caper/core';
import Base from './BaseScene';

export const scene = defineScene({
  id: 'start',
  debug: {
    label: 'Hello World',
    group: 'Start',
  },
});

export default class Start extends Base {
  title = 'Hello World';
  private container: FlexContainer;

  async initialize() {
    await super.initialize();
    this.app.focus.addFocusLayer(this.id);

    // a layout container
    this.container = this.add.flexContainer({
      label: 'Main Container',
      bindToAppSize: true,
      layout: {
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
      },
    });

    // some title text
    this.container.add.text({
      text: 'Hello Caper',
      style: { fontFamily: 'KumbhSans', fontSize: 48, fill: 0xffffff },
    });

    // from src/assets.json
    this.container.add.sprite({
      asset: 'caper',
      label: 'Caper Logo',
      scale: 0.5,
      anchor: 0.5,
      layout: { applySizeDirectly: true, width: 150, height: 150, aspectRatio: 1, flexGrow: 0, flexShrink: 0 },
    });

    const btn = this.container.add.button({
      label: 'Button',
      cursor: 'pointer',
      y: 50,
      textures: {
        default: 'btn/blue',
        hover: 'btn/yellow',
        disabled: 'btn/grey',
        active: 'btn/red',
      },
      textLabel: {
        text: 'Go to Assets',
        style: { fontFamily: 'KumbhSans', fontSize: 32, fill: 0xffffff },
      },
      layout: {
        transformOrigin: 'top left',
        width: 256,
        height: 70,
        applySizeDirectly: true,
        isLeaf: true,
      },
      sounds: {
        click: 'click',
        hover: 'hover',
      },
    });

    btn.onClick.connectOnce(() => {
      this.app.scenes.loadScene('assets');
    });

    this.app.focus.add(btn);
  }

  start() {}

  resize() {
    super.resize();
    // the layout container binds to the app size,
    // but we still need to center it
    this.container.position.set(-this.app.size.width * 0.5, -this.app.size.height * 0.5);
  }
}
