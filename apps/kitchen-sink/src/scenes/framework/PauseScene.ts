import BaseScene from '@/scenes/BaseScene';
import { CaperColors } from '@/theme';
import { CaperPanel } from '@/ui/CaperPanel';
import { FONT_BODY } from '@/utils/Constants';
import { Button, defineScene, FlexContainer, formatTime, PauseConfig, type SceneAssets, UICanvas } from '@caper/core';
import { gsap } from 'gsap';
import { Sprite, Text } from 'pixi.js';

export const scene = defineScene({
  id: 'pause',
  debug: {
    group: 'Framework',
    label: 'Pause',
  },
});

export default class PauseScene extends BaseScene {
  title = 'Pause';
  subtitle = 'Pause, resume, and observe different pause configurations';
  ui: UICanvas;
  container: FlexContainer;
  buttonContainer: FlexContainer;

  gsapAnimated: Sprite;
  tickerAnimated: Sprite;
  stopwatchDisplay: Text;
  countdownDisplay: Text;
  pauseInfoText: Text;

  tickerAnimationConfig: { direction: number } = { direction: 1 };

  protected config = {
    pauseAudio: false,
    pauseAnimations: false,
    pauseTicker: false,
    pauseTimers: false,
    isPaused: false,
  };

  public get assets(): SceneAssets {
    return {
      preload: {
        assets: [{ alias: 'staticCaperLogo', src: '/static/caper.png' }],
        bundles: ['audio', 'required'],
      },
    };
  }

  public async initialize() {
    await super.initialize();
    this.ui = this.add.uiCanvas({ label: 'UI', useAppSize: true });

    // Main content area
    this.container = this.ui.addElement(
      this.make.flexContainer({
        layout: {
          flexDirection: 'column',
          justifyContent: 'center',
          width: 700,
          gap: 24,
        },
        label: 'Main Container',
      }),
      { align: 'center' },
    );

    // ── Animation demos ──
    const animPanel = new CaperPanel({ width: 660, height: 180, heading: 'Animations' });

    const animContainer = this.make.flexContainer({
      layout: { gap: 24, width: 600, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' },
    });

    animContainer.add.text({
      text: 'GSAP',
      style: { fill: CaperColors.textDim, fontFamily: FONT_BODY, fontWeight: '500', fontSize: 16 },
    });

    this.gsapAnimated = animContainer.add.sprite({
      asset: 'staticCaperLogo',
      scale: 0.2,
      anchor: 0.5,
      layout: { applySizeDirectly: true },
    });

    animContainer.add.text({
      text: 'Pixi Ticker',
      style: { fill: CaperColors.textDim, fontFamily: FONT_BODY, fontWeight: '500', fontSize: 16 },
    });

    this.tickerAnimated = animContainer.add.sprite({
      asset: 'staticCaperLogo',
      scale: 0.2,
      anchor: 0.5,
      layout: { applySizeDirectly: true },
    });

    animPanel.contentContainer.addChild(animContainer);
    this.container.add.existing(animPanel, {
      layout: { width: 660, height: 180, applySizeDirectly: true },
    });

    this.addAnimation(
      gsap.to(this.gsapAnimated, {
        x: 180,
        duration: 1,
        ease: 'power2.inOut',
        yoyo: true,
        repeat: -1,
      }),
    );

    // ── Timer displays ──
    const timerRow = this.container.add.flexContainer({
      layout: { gap: 24, justifyContent: 'center', flexWrap: 'wrap' },
    });

    // Stopwatch panel
    const swPanel = new CaperPanel({ width: 318, height: 110, heading: 'Stopwatch' });
    this.stopwatchDisplay = new Text({
      text: '00:00:00',
      style: { fill: CaperColors.text, fontFamily: FONT_BODY, fontWeight: 'bold', fontSize: 32 },
    });
    this.stopwatchDisplay.position.set(10, 10);
    swPanel.contentContainer.addChild(this.stopwatchDisplay);
    timerRow.add.existing(swPanel, {
      layout: { width: 318, height: 110, applySizeDirectly: true },
    });

    this.app.timers.createTimer({ autoStart: true, onTick: this._updateStopWatch });

    // Countdown panel
    const cdPanel = new CaperPanel({ width: 318, height: 110, heading: 'Countdown' });
    this.countdownDisplay = new Text({
      text: '00:00:00',
      style: { fill: CaperColors.text, fontFamily: FONT_BODY, fontWeight: 'bold', fontSize: 32 },
    });
    this.countdownDisplay.position.set(10, 10);
    cdPanel.contentContainer.addChild(this.countdownDisplay);
    timerRow.add.existing(cdPanel, {
      layout: { width: 318, height: 110, applySizeDirectly: true },
    });

    this.app.timers.createTimer({
      duration: 5000,
      autoStart: true,
      useWorker: true,
      loop: true,
      onTick: this._updateCountdown,
    });

    // ── Buttons ──
    this.buttonContainer = this.ui.addElement(
      this.make.flexContainer({
        label: 'Button Container',
        layout: {
          flexDirection: 'column',
          gap: 12,
          paddingBottom: 30,
          paddingRight: 30,
          width: 240,
        },
      }),
      { align: 'bottom right' },
    );

    const musicButton = this.buttonContainer.add.button({
      scale: 0.5,
      cursor: 'pointer',
      label: 'Music Button',
      textures: { default: 'btn/blue', hover: 'btn/yellow', disabled: 'btn/grey', active: 'btn/red' },
      layout: { height: 70, width: 256 },
      sheet: 'ui',
      accessibleTitle: 'Toggle Music',
      textLabel: {
        text: 'Toggle Music',
        anchor: 0.5,
        resolution: 2,
        style: { fill: 0xffffff, fontFamily: FONT_BODY, fontWeight: 'bold', fontSize: 36, align: 'center' },
      },
    });

    musicButton.onClick.connect(async () => {
      if (this.app.audio.isPlaying('Night at the Beach', 'music')) {
        await this.app.audio.stop('Night at the Beach', 'music');
      } else {
        await this.app.audio.play('Night at the Beach', 'music', { singleInstance: true, loop: true });
      }
      this.onMusicToggle(musicButton);
    });

    const pauseButton = this.buttonContainer.add.button({
      scale: 0.5,
      cursor: 'pointer',
      label: 'Pause Button',
      textures: { default: 'btn/blue', hover: 'btn/yellow', disabled: 'btn/grey', active: 'btn/red' },
      layout: { height: 70, width: 256 },
      sheet: 'ui',
      accessibleTitle: 'Toggle Pause',
    });

    pauseButton.addLabel({
      text: 'Toggle Pause',
      anchor: 0.5,
      resolution: 2,
      style: { fill: 0xffffff, fontFamily: FONT_BODY, fontWeight: 'bold', fontSize: 36, align: 'center' },
    });

    pauseButton.onClick.connect(() => {
      this.config.isPaused = !this.config.isPaused;
      this.app.togglePause({
        pauseAudio: this.config.pauseAudio,
        pauseAnimations: this.config.pauseAnimations,
        pauseTicker: this.config.pauseTicker,
        pauseTimers: this.config.pauseTimers,
      });
      this.onPauseToggle(pauseButton);
    });

    this.onMusicToggle(musicButton);
    this.onPauseToggle(pauseButton);

    // ── Pause info (replaces HTMLText) ──
    const infoPanel = new CaperPanel({ width: 260, height: 160, heading: 'Pause State' });
    this.pauseInfoText = new Text({
      text: '',
      style: { fill: CaperColors.textDim, fontFamily: FONT_BODY, fontSize: 13, lineHeight: 20 },
    });
    this.pauseInfoText.position.set(0, 0);
    infoPanel.contentContainer.addChild(this.pauseInfoText);
    infoPanel.visible = false;

    this.ui.addElement(infoPanel, { align: 'bottom left' });
    // Store reference on the panel so we can toggle visibility
    (this as any)._infoPanel = infoPanel;
  }

  _updatePauseInfo() {
    const lines = [
      `Audio: ${this.config.pauseAudio ? 'paused' : 'running'}`,
      `Animations: ${this.config.pauseAnimations ? 'paused' : 'running'}`,
      `Ticker: ${this.config.pauseTicker ? 'paused' : 'running'}`,
      `Timers: ${this.config.pauseTimers ? 'paused' : 'running'}`,
    ];
    this.pauseInfoText.text = lines.join('\n');
    const infoPanel = (this as any)._infoPanel as CaperPanel;
    if (infoPanel) {
      infoPanel.visible = this.app.paused;
    }
    this.ui.updateLayout();
  }

  _updateStopWatch(elapsed: number) {
    this.stopwatchDisplay.text = formatTime(elapsed, 'ms');
  }

  _updateCountdown(elapsed: number) {
    this.countdownDisplay.text = formatTime(elapsed, 'ms');
    if (this.app.paused) {
      this.app.render();
    }
  }

  onPauseToggle(pauseButton: Button) {
    const text = pauseButton.getChildAt(1) as Text;
    if (!text) return;
    text.text = this.config.isPaused ? 'Resume App' : 'Pause App';
    pauseButton.setTexture('default', this.config.isPaused ? 'btn/red' : 'btn/blue');
  }

  onPause(config: PauseConfig): void {
    this._updatePauseInfo();
  }

  onResume(config: PauseConfig): void {
    this._updatePauseInfo();
  }

  onMusicToggle(musicButton: Button) {
    const text = musicButton.getChildAt(1) as Text;
    if (this.app.audio.isPlaying('Night at the Beach', 'music')) {
      if (text) text.text = 'Stop Music';
      musicButton.setTexture('default', 'btn/red');
    } else {
      if (text) text.text = 'Play Music';
      musicButton.setTexture('default', 'btn/blue');
    }
  }

  configureGUI() {
    const folder = this.gui.addFolder('Pause Configuration');
    folder.open();
    folder.add(this.config, 'pauseAudio').name('Audio');
    folder.add(this.config, 'pauseAnimations').name('Animations');
    folder.add(this.config, 'pauseTicker').name('Ticker');
    folder.add(this.config, 'pauseTimers').name('Timers');
  }

  update() {
    this.tickerAnimated.x += 3 * this.tickerAnimationConfig.direction;
    if (this.tickerAnimated.x >= 200) {
      this.tickerAnimationConfig.direction = -1;
    } else if (this.tickerAnimated.x <= 0) {
      this.tickerAnimationConfig.direction = 1;
    }
  }

  resize() {
    super.resize();
    this.ui.updateLayout();
  }

  destroy() {
    super.destroy();
    this.app.audio.stopAll(true, 0.5, { ease: 'sine.in' });
  }
}
