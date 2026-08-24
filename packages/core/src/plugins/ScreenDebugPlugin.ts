import { Plugin } from './Plugin';

type TimelineEntry = { t: number; type: string; innerH: number; vvH: number };

export class ScreenDebugPlugin extends Plugin {
  public readonly id = 'screenDebug';

  private _panel: HTMLDivElement | null = null;
  private _visibleBottom: HTMLDivElement | null = null;
  private _canvasBottom: HTMLDivElement | null = null;
  private _safeAreaProbe: HTMLDivElement | null = null;
  private _startedAt = 0;
  private _timeline: TimelineEntry[] = [];
  private _initialVvH = 0;

  public initialize(): void {
    if (typeof document === 'undefined') {
      return;
    }

    this._startedAt = performance.now();
    this._initialVvH = window.visualViewport?.height ?? window.innerHeight;

    this._panel = document.createElement('div');
    this._panel.dataset.caperScreenDebug = 'panel';
    this._panel.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:999999;pointer-events:none;font:10px/1.4 monospace;' +
      'color:#9f9;background:rgba(0,0,0,.75);padding:6px 8px;border-radius:4px;max-width:86vw;white-space:pre;';
    this._visibleBottom = this._makeMarker('red', 'visible-bottom');
    this._canvasBottom = this._makeMarker('cyan', 'canvas-bottom');
    document.body.append(this._panel, this._visibleBottom, this._canvasBottom);

    this.listen(window, 'resize', () => this._onViewportEvent('resize'));
    this.listen(window, 'orientationchange', () => this._onViewportEvent('orientationchange'));
    if (window.visualViewport) {
      this.listen(window.visualViewport, 'resize', () => this._onViewportEvent('vv.resize'));
    }

    const interval = window.setInterval(() => this._update(), 500);
    this.addDisposer(
      () => window.clearInterval(interval),
      () => {
        this._panel?.remove();
        this._visibleBottom?.remove();
        this._canvasBottom?.remove();
        this._safeAreaProbe?.remove();
        this._panel = this._visibleBottom = this._canvasBottom = this._safeAreaProbe = null;
      },
    );
    this._update();
  }

  private _makeMarker(color: string, name: string): HTMLDivElement {
    const marker = document.createElement('div');
    marker.dataset.caperScreenDebug = name;
    marker.style.cssText =
      `position:fixed;left:0;width:100%;height:2px;background:${color};` +
      'z-index:999999;pointer-events:none;';
    return marker;
  }

  private _onViewportEvent(type: string): void {
    const innerH = window.innerHeight;
    const vvH = window.visualViewport?.height ?? innerH;
    this._timeline.push({ t: performance.now() - this._startedAt, type, innerH, vvH });
    if (this._timeline.length > 20) {
      this._timeline.shift();
    }
    this._update();
  }

  private _update(): void {
    if (!this._panel || !this._visibleBottom || !this._canvasBottom) {
      return;
    }

    const vv = window.visualViewport;
    const canvas = this._getCanvas();
    const canvasRect = canvas?.getBoundingClientRect();
    const safeArea = this._measureSafeAreaCssPx();
    const renderer = this._getRenderer();
    const appSize = this._getAppSize();
    const resizer = this._getResizer();
    const r = (n: number) => Math.round(n * 10) / 10;
    const viewportUnits = ['dvh', 'svh', 'lvh', 'vh'].map((unit) => `${unit} ${r(this._measureViewportUnit(unit))}`);
    const events = this._timeline.map((event, index) => {
      const prior = this._timeline[index - 1];
      return `+${Math.round(event.t)}ms ${event.type} ${r(prior?.vvH ?? this._initialVvH)}→${r(event.vvH)}`;
    });

    this._panel.textContent = [
      `inner ${window.innerWidth}x${window.innerHeight}`,
      `client ${document.documentElement.clientHeight}`,
      `vv ${vv ? `${r(vv.width)}x${r(vv.height)} scale ${vv.scale} offsetTop ${r(vv.offsetTop)}` : 'n/a'}`,
      ...viewportUnits,
      `screen ${window.screen.width}x${window.screen.height}`,
      `dpr ${window.devicePixelRatio}`,
      `standalone ${window.matchMedia('(display-mode: standalone)').matches}`,
      `env ${safeArea.top},${safeArea.right},${safeArea.bottom},${safeArea.left}`,
      `canvas ${canvasRect ? `top ${r(canvasRect.top)} bottom ${r(canvasRect.bottom)} height ${r(canvasRect.height)}` : 'n/a'} style ${canvas?.style.height || 'n/a'}`,
      `renderer ${renderer ? `${renderer.width}x${renderer.height} resolution ${renderer.resolution}` : 'n/a'}`,
      `app.size ${appSize ? `${appSize.width}x${appSize.height}` : 'n/a'}`,
      `resizer ${resizer ? `scale ${Math.round(resizer.scale * 1000) / 1000} safeArea ${JSON.stringify(resizer.safeArea)}` : 'n/a'}`,
      ...events,
    ].join('\n');

    this._visibleBottom.style.top = `${(vv ? vv.offsetTop + vv.height : window.innerHeight) - 2}px`;
    if (canvasRect) {
      this._canvasBottom.style.top = `${canvasRect.bottom - 2}px`;
      this._canvasBottom.style.display = 'block';
    } else {
      this._canvasBottom.style.display = 'none';
    }
  }

  private _measureViewportUnit(unit: string): number {
    const probe = document.createElement('div');
    probe.style.cssText = `position:fixed;height:100${unit};visibility:hidden;pointer-events:none;`;
    document.body.appendChild(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  }

  private _measureSafeAreaCssPx(): { top: number; right: number; bottom: number; left: number } {
    if (!this._safeAreaProbe) {
      this._safeAreaProbe = document.createElement('div');
      this._safeAreaProbe.style.cssText =
        'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding-top:env(safe-area-inset-top, 0px);padding-right:env(safe-area-inset-right, 0px);' +
        'padding-bottom:env(safe-area-inset-bottom, 0px);padding-left:env(safe-area-inset-left, 0px);';
      document.body.appendChild(this._safeAreaProbe);
    }
    const style = getComputedStyle(this._safeAreaProbe);
    return {
      top: parseFloat(style.paddingTop) || 0,
      right: parseFloat(style.paddingRight) || 0,
      bottom: parseFloat(style.paddingBottom) || 0,
      left: parseFloat(style.paddingLeft) || 0,
    };
  }

  private _getCanvas(): HTMLCanvasElement | null {
    try {
      return (this.app.renderer?.canvas as HTMLCanvasElement | undefined) ?? null;
    } catch {
      return null;
    }
  }

  private _getRenderer(): { width: number; height: number; resolution: number } | null {
    try {
      return this.app.renderer ?? null;
    } catch {
      return null;
    }
  }

  private _getAppSize(): { width: number; height: number } | null {
    try {
      return this.app.size ?? null;
    } catch {
      return null;
    }
  }

  private _getResizer(): { scale: number; safeArea: unknown } | null {
    try {
      return this.app.resizer ?? null;
    } catch {
      return null;
    }
  }
}
