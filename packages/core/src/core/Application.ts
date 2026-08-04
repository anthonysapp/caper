import { gsap } from 'gsap';
import type {
  AppConfig,
  CaperPWA,
  IApplication,
  IApplicationOptions,
  ICaperAutomation,
  ICoreFunctions,
  ICoreSignals,
  PauseConfig,
} from '.';
import { coreFunctionRegistry, coreSignalRegistry, generatePluginList, sortPluginsByRequires } from '.';
import type {
  ActionSignal,
  AppScenes,
  IAssetsPlugin,
  IAudioManagerPlugin,
  IBreakpointPlugin,
  IControls,
  IFocusManagerPlugin,
  Ii18nPlugin,
  IInputPlugin,
  IKeyboardPlugin,
  IPlugin,
  IPopupManagerPlugin,
  IResizerPlugin,
  ISceneManagerPlugin,
  IWebEventsPlugin,
  LoadSceneConfig,
} from '../plugins';

import type {
  AssetInitOptions,
  AssetsManifest,
  DestroyOptions,
  RendererDestroyOptions,
} from 'pixi.js';
import { Assets, Container as PIXIContainer, isMobile, Application as PIXIPApplication, Point, TextStyle } from 'pixi.js';
import type { IDataAdapter } from '../plugins/DataAdapter';
import type { IStore } from '../store';
import { Store } from '../store';
import type {
  AppTypeOverrides,
  Eases,
  ImportList,
  ImportListItem,
  SceneId,
  SceneLoadArgs,
  Size,
} from '../utils';
import { bindAllMethods, deepMerge, getDynamicModuleFromImportListItem, isDev, isPromise, Logger } from '../utils';
import { triggerViteError } from '../utils/vite';

// Type-only — the value is read lazily in the `make` getter via the import-free
// registration slot, so Application never pulls the factory table (and with it
// every ui/display class) into its own module graph. See mixins/factory/defaults.
import type { defaultFactoryMethods } from '../mixins/factory/const';
import { getDefaultFactoryMethods } from '../mixins/factory/defaults';
import { createFactoryMethods } from '../mixins/factory/methods';
import type { IActionsPlugin } from '../plugins/actions';
import type { IVoiceOverPlugin } from '../plugins/audio/VoiceOverPlugin';
import type { ICaptionsPlugin } from '../plugins/captions';
import { defaultPlugins } from '../plugins/defaults';
import { type IDevToolsPlugin } from '../plugins/DevToolsPlugin';
import { IFullScreenPlugin } from '../plugins/FullScreenPlugin';
import { type IGSAPPlugin } from '../plugins/GSAPPlugin';
import { ILookupPlugin } from '../plugins/LookupPlugin';
import { ITimerPlugin } from '../plugins/TimerPlugin';
import { Signal } from '../signals';

type App = AppTypeOverrides['App'];
type AppContexts = AppTypeOverrides['Contexts'];
type AppActions = AppTypeOverrides['Actions'];
type AppPlugins = AppTypeOverrides['Plugins'];

function getDefaultResolution() {
  return typeof window !== 'undefined' ? (window.devicePixelRatio > 1 ? 2 : 1) : 2;
}

const defaultApplicationOptions: Partial<IApplicationOptions> = {
  antialias: false,
  autoStart: true,
  resizeToContainer: true,
  backgroundColor: 0x0,
  backgroundAlpha: 1,
  clearBeforeRender: false,
  context: null,
  eventFeatures: undefined,
  eventMode: undefined,
  hello: false,
  powerPreference: 'high-performance',
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  resizeTo: undefined,
  sharedTicker: true,
  view: undefined,
  autoDensity: false,
  defaultTextStyle: {
    fontFamily: 'Arial',
    fontSize: 20,
    fontWeight: 'normal',
    fontStyle: 'normal',
    align: 'left',
    breakWords: false,
    fill: 0,
    fontVariant: 'normal',
    leading: 0,
    letterSpacing: 0,
    lineHeight: 0,
    padding: 0,
    stroke: undefined,
    textBaseline: 'alphabetic',
    trim: false,
    whiteSpace: 'pre',
    wordWrap: false,
    wordWrapWidth: 100,
  },
  resolution: getDefaultResolution(), // must be 1 or 2
  useHash: isDev,
  showSceneDebugMenu: isDev,
  showStats: isDev,
  useStore: true,
  useSpine: false,
  useLayout: false,
  useVoiceover: false,
  plugins: [],
  scenes: [],
  defaultSceneLoadMethod: 'immediate',
  assets: {
    manifest: './assets.json',
  },
};

const defaultPauseConfig: PauseConfig = {
  pauseAudio: true,
  pauseAnimations: true,
  pauseTicker: true,
  pauseTimers: true,
};

const emptyPauseConfig: PauseConfig = {
  pauseAudio: false,
  pauseAnimations: false,
  pauseTicker: false,
  pauseTimers: false,
};

export class Application extends PIXIPApplication implements IApplication {
  // static properties
  public static containerElement: HTMLElement;

  // singleton instance
  public static instance: IApplication;

  // method binding root
  private static readonly __caper_method_binding_root = true;

  // debug overlay (lazy, see getter)
  private _debugContainer: PIXIContainer;

  // config
  public config: Partial<IApplicationOptions>;
  /**
   * Automation facade for Playwright / agent drivers. Only assigned when
   * automation is enabled (dev env, `config.automation === true`, or
   * `VITE_CAPER_AUTOMATION === 'true'`); otherwise undefined.
   */
  public automation?: ICaperAutomation;
  public plugins: ImportList<IPlugin>;
  public manifest: string | AssetsManifest | undefined;
  public onPause = new Signal<(config: PauseConfig) => void>();
  public onResume = new Signal<(config: PauseConfig) => void>();
  // signals
  public onResize = new Signal<(size: Size) => void>();
  /**
   * Emitted when a plugin throws during initialize/postInitialize. Previously
   * these failures bricked the app silently.
   */
  public onPluginError = new Signal<
    (detail: { id: string; phase: 'initialize' | 'postInitialize'; error: unknown }) => void
  >();
  /**
   * Emitted when the browser offers its PWA install prompt, so a game can show its
   * own in-pixi install UI.
   *
   * The browser usually fires this before the first scene exists, and signals do not
   * replay — so UI that offers an install button must ALSO check `app.pwa?.canInstall`
   * when it mounts. And `app.pwa.promptInstall()` only works from inside a user
   * gesture, i.e. a button's click/tap handler, never a timer or a game event.
   */
  public onPwaInstallAvailable = new Signal<() => void>();
  /**
   * Emitted when a new build is waiting to take over. Call `app.pwa.applyUpdate()`
   * to activate it — the page reloads once the new worker takes control.
   *
   * Use `pwa: { update: 'manual' }` in the vite preset to suppress caper's default
   * DOM banner and present this in-game instead.
   */
  public onPwaUpdateAvailable = new Signal<() => void>();
  // plugins
  public readonly _plugins: Map<string, IPlugin> = new Map();
  // default plugins
  protected _assetManager: IAssetsPlugin;
  protected _lookup: ILookupPlugin;
  protected _sceneManager: ISceneManagerPlugin;
  protected _webEventsManager: IWebEventsPlugin;
  protected _fullScreenPlugin: IFullScreenPlugin;
  protected _keyboardManager: IKeyboardPlugin;
  protected _focusManager: IFocusManagerPlugin;
  protected _popupManager: IPopupManagerPlugin;
  protected _timerPlugin: ITimerPlugin;
  protected _audioManager: IAudioManagerPlugin;
  protected _voiceoverPlugin: IVoiceOverPlugin;
  protected _captionsPlugin: ICaptionsPlugin;
  protected _actions: ActionSignal;

  protected _env: Record<string, string> = (import.meta as any).env || {};
  protected _makeFactory: typeof defaultFactoryMethods;

  protected _isFullScreen: boolean = false;
  protected _fullScreenElement: HTMLElement | Window | null = null;

  get make(): typeof defaultFactoryMethods {
    if (!this._makeFactory) {
      this._makeFactory = createFactoryMethods(
        getDefaultFactoryMethods() as typeof defaultFactoryMethods,
        this,
        false,
      );
    }
    return this._makeFactory;
  }

  get env() {
    return this._env;
  }

  /**
   * The `Caper.pwa` facade, or undefined when the app was built without the vite
   * preset's `pwa` option. See {@link CaperPWA} for the install/update timing rules.
   */
  get pwa(): CaperPWA | undefined {
    return (globalThis as any).Caper?.pwa;
  }

  get debugContainer(): PIXIContainer {
    if (!this._debugContainer) {
      this._debugContainer = new PIXIContainer();
      this._debugContainer.label = 'DebugOverlay';
      this._debugContainer.eventMode = 'none';
      this._debugContainer.interactiveChildren = false;
      this.stage.addChild(this._debugContainer);
    }
    return this._debugContainer;
  }

  protected _paused: boolean = false;
  protected _pauseConfig: Partial<PauseConfig> = {};

  public get paused(): boolean {
    return this._paused;
  }

  public pause(config?: Partial<PauseConfig>) {
    this._paused = true;
    this._pauseConfig = { ...(config ? emptyPauseConfig : defaultPauseConfig), ...config };
    if (this._pauseConfig.pauseAudio) {
      this.audio.pause();
    }
    if (this._pauseConfig.pauseAnimations) {
      gsap?.globalTimeline?.pause();
    }
    if (this._pauseConfig.pauseTicker) {
      this.ticker.stop();
    }
    if (this._pauseConfig.pauseTimers) {
      this.timers.pauseAllTimers();
    }
    if (this._pauseConfig.pauseOther) {
      this._pauseConfig.pauseOther.forEach((thing) => {
        if (typeof thing?.pause === 'function') {
          thing.pause();
        }
      });
    }
    this.onPause.emit(this._pauseConfig);
  }

  public resume() {
    this._paused = false;
    if (this._pauseConfig.pauseAudio) {
      if (this.audio.paused) {
        this.audio.resume();
      }
    }
    if (this._pauseConfig.pauseAnimations) {
      if (gsap?.globalTimeline?.paused()) {
        gsap?.globalTimeline?.resume();
      }
    }
    if (this._pauseConfig.pauseTicker) {
      if (!this.ticker.started) {
        this.ticker.start();
      }
    }
    if (this._pauseConfig.pauseTimers) {
      this.timers.resumeAllTimers();
    }
    if (this._pauseConfig.pauseOther) {
      this._pauseConfig.pauseOther.forEach((thing) => {
        if (typeof thing?.resume === 'function') {
          thing.resume();
        }
      });
    }
    if (this._pauseConfig.clearOnResume) {
      this._pauseConfig = {};
    }
    this.onResume.emit(this._pauseConfig);
  }

  public togglePause(config?: Partial<PauseConfig>) {
    this._paused = !this._paused;
    if (this._paused) {
      this.pause(config);
    } else {
      this.resume();
    }
  }

  constructor() {
    super();
    bindAllMethods(this);
  }

  protected _appVersion: string | number;

  public get appVersion() {
    try {
      this._appVersion = __CAPER_APP_VERSION;
    } catch {
      this._appVersion = -1;
    }

    return this._appVersion;
  }

  protected _appName: string;

  public get appName(): string {
    if (!this._appName) {
      try {
        this._appName = __CAPER_APP_NAME;
      } catch {
        this._appName = 'n/a';
      }
    }
    return this._appName;
  }

  protected _i18n: Ii18nPlugin;

  public get i18n(): Ii18nPlugin {
    if (!this._i18n) {
      this._i18n = this.getPlugin<Ii18nPlugin>('i18n');
    }
    return this._i18n;
  }

  protected _resizer: IResizerPlugin;

  public get resizer(): IResizerPlugin {
    if (!this._resizer) {
      this._resizer = this.getPlugin<IResizerPlugin>('resizer');
    }
    return this._resizer;
  }

  protected _breakpoints: IBreakpointPlugin;

  public get breakpoints(): IBreakpointPlugin {
    if (!this._breakpoints) {
      this._breakpoints = this.getPlugin<IBreakpointPlugin>('breakpoints');
    }
    return this._breakpoints;
  }

  // actions
  protected _actionsPlugin: IActionsPlugin<AppContexts>;

  public get actionsPlugin(): IActionsPlugin<AppContexts> {
    if (!this._actionsPlugin) {
      this._actionsPlugin = this.getPlugin<IActionsPlugin<AppContexts>>('actions');
    }
    return this._actionsPlugin;
  }

  // input
  protected _input: IInputPlugin;

  public get input(): IInputPlugin {
    if (!this._input) {
      this._input = this.getPlugin<IInputPlugin>('input');
    }
    return this._input;
  }

  // controls
  public get controls(): IControls {
    if (!this._input) {
      this._input = this.getPlugin<IInputPlugin>('input');
    }
    return this._input.controls;
  }

  // animation
  /**
   * The GSAP plugin.
   * @returns The GSAP plugin.
   */
  public get animation(): IGSAPPlugin {
    return this.getPlugin<IGSAPPlugin>('GSAPPlugin');
  }

  /**
   * The GSAP instance.
   * @returns The GSAP instance.
   */
  public get anim(): typeof gsap {
    return this.getPlugin<IGSAPPlugin>('GSAPPlugin').anim;
  }
  /**
   * Adds one or more GSAP tweens or timelines to a specified animation context.
   * This uses the GSAPPlugin's custom animation context (a Set of tweens/timelines),
   * not a `gsap.Context` instance. If no contextId is provided, animations are added
   * to the plugin's global collection.
   * @param animation - A single GSAP tween/timeline or an array of them.
   * @param contextId - Optional ID of the animation context. Defaults to the global context.
   * @returns The animation(s) that were added.
   */
  public addAnimation(
    animation: gsap.core.Tween | gsap.core.Timeline | (gsap.core.Tween | gsap.core.Timeline)[],
    contextId?: string,
  ): gsap.core.Tween | gsap.core.Timeline | (gsap.core.Tween | gsap.core.Timeline)[] {
    return this.getPlugin<IGSAPPlugin>('GSAPPlugin').addAnimation(animation, contextId);
  }

  /**
   * Returns the registered eases or ease names.
   * @param namesOnly - If true, returns only the ease names.
   * @returns The registered eases or ease names.
   */
  public eases(namesOnly: boolean = false): Eases | string[] {
    const plugin = this.getPlugin<IGSAPPlugin>('GSAPPlugin');
    return namesOnly ? plugin.easeNames : plugin.eases;
  }

  // store
  protected _store: IStore;

  public get store(): IStore {
    return this._store;
  }

  // size
  protected _center = new Point(0, 0);
  public get center(): Point {
    return this._center;
  }

  get lookup(): ILookupPlugin {
    if (!this._lookup) {
      this._lookup = this.getPlugin<ILookupPlugin>('lookup');
    }
    return this._lookup;
  }

  public getChildAtPath(path: string): PIXIContainer | undefined {
    return this.lookup.getChildAtPath(path);
  }

  public getPathForChild(container: PIXIContainer): string {
    return this.lookup.getPathForChild(container);
  }

  public getChildrenAtPaths(...paths: string[]): PIXIContainer[] {
    return this.lookup.getChildrenAtPaths(...paths);
  }

  public getPathsForChildren(...containers: PIXIContainer[]): string[] {
    return this.lookup.getPathsForChildren(...containers);
  }

  public getAllPaths(): string[] {
    return this.lookup.getAllPaths();
  }

  public get assets(): IAssetsPlugin {
    if (!this._assetManager) {
      this._assetManager = this.getPlugin<IAssetsPlugin>('assets');
    }
    return this._assetManager;
  }

  public get scenes(): ISceneManagerPlugin {
    if (!this._sceneManager) {
      this._sceneManager = this.getPlugin<ISceneManagerPlugin>('scenes');
    }
    return this._sceneManager;
  }

  public loadScene<K extends SceneId>(id: K, ...args: SceneLoadArgs<K>): void;
  public loadScene(scene: LoadSceneConfig | AppScenes): void;
  public loadScene(sceneOrId: LoadSceneConfig | AppScenes | SceneId, ...args: unknown[]): void {
    // The plugin's `loadScene` is overloaded — forward args directly.
    (this.scenes.loadScene as (...a: unknown[]) => unknown)(sceneOrId, ...args);
  }

  public get webEvents(): IWebEventsPlugin {
    if (!this._webEventsManager) {
      this._webEventsManager = this.getPlugin<IWebEventsPlugin>('webEvents');
    }
    return this._webEventsManager;
  }

  public get keyboard(): IKeyboardPlugin {
    if (!this._keyboardManager) {
      this._keyboardManager = this.getPlugin<IKeyboardPlugin>('keyboard');
    }
    return this._keyboardManager;
  }

  public get focus(): IFocusManagerPlugin {
    if (!this._focusManager) {
      this._focusManager = this.getPlugin<IFocusManagerPlugin>('focus');
    }
    return this._focusManager;
  }

  get size() {
    return this.resizer.size;
  }

  get safeArea() {
    return this.resizer.safeArea;
  }

  public get popups(): IPopupManagerPlugin {
    if (!this._popupManager) {
      this._popupManager = this.getPlugin<IPopupManagerPlugin>('popups');
    }
    return this._popupManager;
  }

  public get timers(): ITimerPlugin {
    if (!this._timerPlugin) {
      this._timerPlugin = this.getPlugin<ITimerPlugin>('timers');
    }
    return this._timerPlugin;
  }

  public get audio(): IAudioManagerPlugin {
    if (!this._audioManager) {
      this._audioManager = this.getPlugin<IAudioManagerPlugin>('audio');
    }
    return this._audioManager;
  }

  public get actionContext(): AppContexts {
    return this.actionsPlugin.context;
  }

  public set actionContext(context: AppContexts) {
    this.actionsPlugin.context = context;
  }

  public get voiceover(): IVoiceOverPlugin {
    if (!this._voiceoverPlugin) {
      this._voiceoverPlugin = this.getPlugin<IVoiceOverPlugin>('voiceover', this.config.useVoiceover);
    }
    return this._voiceoverPlugin;
  }

  public get captions(): ICaptionsPlugin {
    if (!this._captionsPlugin) {
      this._captionsPlugin = this.getPlugin<ICaptionsPlugin>('captions', this.config.useVoiceover);
    }
    return this._captionsPlugin;
  }
  /** Fullscreen plugin */
  public get fullScreen(): IFullScreenPlugin {
    if (!this._fullScreenPlugin) {
      this._fullScreenPlugin = this.getPlugin<IFullScreenPlugin>('fullscreen');
    }
    return this._fullScreenPlugin;
  }

  get fullScreenElement(): HTMLElement | Window | null {
    return this.fullScreen.fullScreenElement;
  }

  get isFullScreen(): boolean {
    return this.fullScreen.isFullScreen;
  }

  get canFullscreen(): boolean {
    return this.fullScreen.canFullscreen;
  }

  public setFullScreenElement(value: HTMLElement | Window | null) {
    this.fullScreen.setFullScreenElement(value);
  }

  public setFullScreen(value: boolean) {
    this.fullScreen.setFullScreen(value);
  }

  public toggleFullScreen() {
    this.fullScreen.toggleFullScreen();
  }
  /** End Fullscreen plugin */

  get isMobile() {
    return isMobile.any;
  }

  get isTouch() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  get signal(): ICoreSignals {
    return coreSignalRegistry;
  }

  get signals(): ICoreSignals {
    return this.signal;
  }

  get func(): ICoreFunctions {
    return coreFunctionRegistry;
  }

  get exec(): ICoreFunctions {
    return this.func;
  }

  // views
  /**
   * Computed fresh on every access — the splash, transition and captions views
   * are created lazily, so a memoized list would permanently miss anything
   * built after the first resize. Only read at resize cadence.
   */
  public get views(): any[] {
    const views: any[] = [this.scenes.view, this.popups.view];
    if (this.scenes.splash.view) {
      views.push(this.scenes.splash.view);
    }
    if (this.scenes.transition) {
      views.push(this.scenes.transition);
    }
    if (this.captions?.view) {
      views.push(this.captions.view);
    }

    return views;
  }

  public static getInstance<T extends App = App>(): T {
    if (!Application.instance) {
      Logger.warn('Application not created yet');
    }

    return Application.instance as T;
  }

  /**
   * Destroy the application
   * This will destroy all plugins and the store
   * @param {RendererDestroyOptions} rendererDestroyOptions
   * @param {DestroyOptions} options
   */
  public destroy(rendererDestroyOptions?: RendererDestroyOptions, options?: DestroyOptions) {
    this._plugins.forEach((plugin) => {
      plugin.destroy();
    });
    this.store?.destroy();
    super.destroy(rendererDestroyOptions, options);
  }

  public setContainer(container: HTMLElement) {
    Application.containerElement = container;
  }

  public async initialize(config: Partial<AppConfig>, el?: HTMLElement): Promise<AppTypeOverrides['App']> {
    if (Application.instance) {
      throw new Error('Application is already initialized');
    }
    Application.instance = this as unknown as IApplication;

    this.config = deepMerge(defaultApplicationOptions, config);
    this.signals.onResize = this.onResize;

    if (config.container) {
      Application.containerElement = config.container;
    }
    // initialize the logger
    Logger.initialize(this.config.logger);

    // ensure the resolution is 1 or 2
    if (this.config.resolution !== 1 && this.config.resolution !== 2) {
      const userResolution = this.config.resolution;
      this.config.resolution = getDefaultResolution();
      Logger.warn(
        `App resolution must be 1 or 2, setting to ${this.config.resolution} instead of ${userResolution}. Modify your app config to set the resolution to 1 or 2.`,
      );
    }

    await this.boot(this.config);
    await this.initAssets();

    // initialize the pixi application
    await this.init(this.config);
    this.stage.label = 'Stage';

    if (this.config.defaultTextStyle) {
      const style = { ...defaultApplicationOptions.defaultTextStyle, ...this.config.defaultTextStyle };
      TextStyle.defaultTextStyle = style;
    }
    if (this.config.defaultDropShadow) {
      TextStyle.defaultDropShadow = this.config.defaultDropShadow;
    }
    if (el) {
      el.appendChild(this.canvas as HTMLCanvasElement);
      this.setContainer(el);
    } else {
      throw new Error('No element found to append the view to.');
    }
    await this.registerDefaultPlugins();

    if (isDev) {
      this.getPlugin<IDevToolsPlugin>('DevToolsPlugin').initializeDevTools(this);
    }

    this.signals.onLoadRequiredComplete.connectOnce(this.requiredAssetsLoaded);

    // internal setup
    await this._setup();

    this.plugins = await generatePluginList(this.config.plugins || []);

    // register the applications custom plugins (storage-capable or not — one pipeline)
    await this.registerPlugins();

    await this.setup();
    await this.loadDefaultScene();

    // focus the canvas
    this.renderer.canvas.focus();

    if (this.config.container) {
      this.config.container.classList.add('loaded');
    }

    // return the Application instance to the create method, if needed
    return Application.instance as unknown as App;
  }

  public getPlugin<T extends IPlugin>(pluginName: AppPlugins, debug: boolean = false): T {
    const plugin = this._plugins.get(pluginName) as T;
    if (!plugin && debug) {
      Logger.warn(`Plugin with name "${pluginName}" not found.`);
    }
    return plugin;
  }

  /**
   * Framework post-initialization. Always runs the plugin `postInitialize` loop and
   * core wiring, then invokes the user-overridable {@link postInitialize} hook last.
   * The runtime (`create()`) calls this — apps should not call it directly, and must
   * NOT need to call `super` from their own `postInitialize` override to get wired up.
   */
  async _postInitialize(): Promise<void> {
    // start plugins
    for (const plugin of this._plugins.values()) {
      try {
        await plugin.postInitialize(this as unknown as IApplication);
      } catch (error) {
        // Surfaced (not just logged) so a plugin that silently fails to wire up —
        // e.g. InputPlugin's controls.connect() — is visible in dev, not invisible.
        triggerViteError({
          message: `Plugin "${plugin.id}" failed in postInitialize: ${error instanceof Error ? error.message : String(error)}`,
          stack: error instanceof Error ? error.stack : undefined,
        });
        this.onPluginError.emit({ id: plugin.id, phase: 'postInitialize', error });
      }
    }

    this._connectPwaSignals();

    this.webEvents.onVisibilityChanged.connect((visible) => {
      if (visible) {
        this.audio.restore();
        this.timers.resumeAllTimers();
      } else {
        this.audio.suspend();
        this.timers.pauseAllTimers();
      }
    });

    // User hook, run last. Framework wiring above always runs regardless of whether
    // a subclass override calls super, so overriding `postInitialize` is footgun-free.
    await this.postInitialize();
  }

  /**
   * Republishes the `Caper.pwa` callbacks as app signals. The existing handlers are
   * wrapped rather than replaced — clobbering them would cost `update: 'prompt'` its
   * default banner, and an app that assigned an early handler its handler.
   */
  private _connectPwaSignals(): void {
    const pwa = this.pwa;
    if (!pwa) return;

    const onCanInstall = pwa.onCanInstall;
    pwa.onCanInstall = () => {
      onCanInstall?.();
      this.onPwaInstallAvailable.emit();
    };

    const onNeedRefresh = pwa.onNeedRefresh;
    pwa.onNeedRefresh = () => {
      onNeedRefresh?.();
      this.onPwaUpdateAvailable.emit();
    };
  }

  /**
   * User-overridable post-initialization hook, invoked after all framework wiring is
   * complete. Override to perform app setup that depends on a fully initialized
   * environment. Safe to override WITHOUT calling `super` — framework post-init lives
   * in {@link _postInitialize}, which the runtime calls.
   */
  async postInitialize(): Promise<void> {}

  public getUnloadedPlugin(id: string): ImportListItem<IPlugin> | undefined {
    return this.plugins.find((pluginItem) => pluginItem.id === id);
  }

  async loadPlugin(listItem: ImportListItem, isDefault: boolean = false) {
    if (this._plugins.has(listItem.id)) {
      return await this.registerPlugin(this._plugins.get(listItem.id)!, listItem.options);
    }
    const plugin = await getDynamicModuleFromImportListItem(listItem);
    const pluginInstance = new plugin(listItem.id);
    if (pluginInstance.id !== listItem.id) {
      pluginInstance.id = listItem.id;
    }
    let opts = listItem.options;
    if (isDefault && !opts) {
      opts = this.config[pluginInstance.id as keyof IApplicationOptions];
    }
    return await this.registerPlugin(pluginInstance, opts);
  }

  /**
   * Gets an ActionSignal for the specified action type
   * @template TActionData - The type of data associated with the action
   * @param {A} action - The action to get the signal for
   * @returns {ActionSignal<TActionData>} A signal that can be used to listen for the action
   * @example
   * // Listen for a 'jump' action
   * app.actions('jump').connect((data) => {
   *   player.jump(data.power);
   * });
   */
  public actions<TActionData = any>(action: AppActions): ActionSignal<TActionData> {
    return this.actionsPlugin.getAction<TActionData>(action as string);
  }

  /**
   * Dispatches an action with optional data
   * @template TActionData - The type of data to send with the action
   * @param {A} action - The action to dispatch
   * @param {TActionData} [data] - Optional data to send with the action
   * @example
   * // Send a 'jump' action with power data
   * app.sendAction('jump', { power: 100 });
   */
  public sendAction<TActionData = any>(action: AppActions, data?: TActionData) {
    this.actionsPlugin.sendAction<TActionData>(action as string, data);
  }

  /**
   * Dispatches an action with optional data
   * alias for sendAction
   * @template TActionData - The type of data to send with the action
   * @param {A} action - The action to dispatch
   * @param {TActionData} [data] - Optional data to send with the action
   * @example
   * // Send a 'jump' action with power data
   * app.action('jump', { power: 100 });
   */
  public action<TActionData = any>(action: AppActions, data?: TActionData) {
    this.sendAction(action, data);
  }

  /**
   * Checks if an action is currently active, i.e. held right now on keyboard
   * or touch controls. Whether an action is merely *declared* is a separate
   * question — use `app.actionsPlugin.getActions()` for that.
   * @param {A} action - The action to check
   * @returns {boolean} True if the action is active, false otherwise
   * @example
   * // Check if the 'run' action is active
   * if (app.isActionActive('run')) {
   *   player.updateSpeed(runningSpeed);
   * }
   */
  public isActionActive(action: AppActions): boolean {
    return this.input.isActionActive(action as string);
  }

  /**
   * The built-in DataAdapter plugin (in-memory game data with optional
   * localStorage backup). Routed through the plugin registry, not `store` —
   * its API is richer than generic save/load.
   */
  public get data(): IDataAdapter {
    return this.getPlugin<IPlugin & IDataAdapter>('data');
  }

  protected async boot(config?: Partial<IApplicationOptions>): Promise<void> {
    this.config = { ...defaultApplicationOptions, ...config };
    await this.preInitialize(this.config);
  }

  protected async preInitialize(config: Partial<IApplicationOptions>): Promise<void> {
    const { id } = config;
    this._appName = id!;

    if (isDev) {
      await this.loadPlugin({
        id: 'DevToolsPlugin',
        module: () => import('../plugins/DevToolsPlugin'),
        namedExport: 'DevToolsPlugin',
      });
    }

    if (config.useLayout) {
      await this.loadPlugin({
        id: 'LayoutPlugin',
        module: () => import('../plugins/LayoutPlugin'),
        namedExport: 'LayoutPlugin',
      });
    }
    await this.loadPlugin({
      id: 'GSAPPlugin',
      module: () => import('../plugins/GSAPPlugin'),
      namedExport: 'GSAPPlugin',
    });
    if (config.useSpine) {
      await this.loadPlugin({
        id: 'SpinePlugin',
        module: () => import('../plugins/spine/SpinePlugin'),
        namedExport: 'SpinePlugin',
      });
    }

    if (this.config.useStore) {
      this._store = new Store();
      this._store.initialize(this as unknown as IApplication);
      // Register the built-in DataAdapter as a normal plugin so it lives in
      // `_plugins` alongside everything else.
      await this.loadPlugin({
        id: 'data',
        module: () => import('../plugins/DataAdapter'),
        namedExport: 'DataAdapter',
        options: this.config.data,
      });
    }
  }

  // plugins
  protected async registerPlugin(plugin: IPlugin, options?: any) {
    if (this._plugins.has(plugin.id)) {
      Logger.warn(`Plugin with id "${plugin.id}" already registered. Not registering.`);
      return plugin.initialize(options, this as unknown as IApplication);
    }
    plugin.registerCoreFunctions();
    plugin.registerCoreSignals();
    this._plugins.set(plugin.id, plugin);
    try {
      return await plugin.initialize(options, this as unknown as IApplication);
    } catch (error) {
      triggerViteError({
        message: `Plugin "${plugin.id}" failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
        stack: error instanceof Error ? error.stack : undefined,
      });
      this.onPluginError.emit({ id: plugin.id, phase: 'initialize', error });
      return undefined;
    }
  }

  protected async registerDefaultPlugins() {
    for (let i = 0; i < defaultPlugins.length; i++) {
      const listItem = defaultPlugins[i];
      await this.loadPlugin(listItem, true);
    }
    const showStats = this.config.showStats === true || (isDev && this.config.showStats !== false);
    if (showStats) {
      await this.loadPlugin({
        id: 'stats',
        module: () => import('../plugins/StatsPlugin'),
        namedExport: 'StatsPlugin',
      });
    }
    if (this.config.useVoiceover) {
      await this.loadPlugin({
        id: 'voiceover',
        module: () => import('../plugins/audio/VoiceOverPlugin'),
        namedExport: 'VoiceOverPlugin',
        options: this.config['voiceover' as keyof IApplicationOptions] || undefined,
      });
      await this.loadPlugin({
        id: 'captions',
        module: () => import('../plugins/captions/CaptionsPlugin'),
        namedExport: 'CaptionsPlugin',
        options: this.config['captions' as keyof IApplicationOptions] || undefined,
      });
    }
  }

  protected async registerPlugins() {
    if (!this.plugins?.length) {
      return;
    }

    // Topologically sort by `requires` so a plugin's dependencies always
    // initialize first, regardless of the order in caper.config.ts. Fails
    // bootstrap loudly on missing required plugins or dependency cycles —
    // see Plugin docs for the rationale (we want the config file to be
    // the single source of truth for active plugins, not auto-resolve).
    // The already-registered built-ins are passed along so `requires: ['audio']`
    // and friends resolve instead of failing bootstrap.
    const sorted = sortPluginsByRequires(this.plugins, new Set(this._plugins.keys()));

    for (const p of sorted) {
      if (p.autoLoad) {
        await this.loadPlugin(p);
      }
    }
  }

  /**
   * This is called after the required assets are loaded
   * You can be sure that all the assets on the assets.preload from caper.config are loaded
   * @protected
   */
  protected requiredAssetsLoaded(): Promise<void> | void;

  protected async requiredAssetsLoaded(): Promise<void> {
    // override me
  }
  /**
   * This is called after the application is initialized
   * You can be sure that
   * - all plugins are registered
   * - the store is created, with all storage adapters registered
   * @protected
   */
  protected setup(): Promise<void> | void;

  protected async setup(): Promise<void> {
    // override me to set up application specific stuff
  }

  protected async initAssets(): Promise<void> {
    const opts: Partial<AssetInitOptions> = this.config.assets?.initOptions || {};
    let manifest = this.config.assets?.manifest || opts.manifest;
    if (isPromise(manifest)) {
      manifest = await manifest;
    }
    opts.manifest = manifest as AssetsManifest;
    opts.basePath = opts.basePath || './assets';
    await Assets.init(opts);
    /** @ts-expect-error manifest is not a public property */
    this.manifest = Assets.resolver._manifest;
  }

  protected async loadDefaultScene(): Promise<void> {
    return this.scenes.loadDefaultScene();
  }

  private async _resize(): Promise<Size> {
    // Wait for DOM content to be loaded
    if (document.readyState !== 'complete') {
      await new Promise<void>((resolve) => {
        window.addEventListener('load', () => resolve(), { once: true });
      });
    }

    // Add a small delay to ensure canvas dimensions are set
    await new Promise((resolve) => setTimeout(resolve, 50));

    return new Promise((resolve) => {
      this.resizer.resize().then((size) => {
        this._center.set(size.width * 0.5, size.height * 0.5);

        this.views.forEach((view) => {
          if (!view || !view.position) {
            return;
          }
          view.position.set(this._center.x, this._center.y);
        });
        this.onResize.emit(this.size);
        resolve(size);
      });
    });
  }
  /**
   * Called after the application is initialized
   * Here we add application specific signal listeners, etc
   * @returns {Promise<void>}
   * @private
   */
  private async _setup(): Promise<void> {
    // connect onResize signal
    this.webEvents.onResize.connect(this._resize, -1);

    await this._resize();

    if (this.scenes.splash?.view && this.scenes.splash.zOrder === 'bottom') {
      this._addSplash();
    }
    // scene manager
    this.scenes.view.label = 'SceneManager';
    this.stage.addChild(this.scenes.view);

    if (this.scenes.splash?.view && this.scenes.splash.zOrder === 'top') {
      this._addSplash();
    }

    if (this.scenes.transition) {
      this.scenes.transition.label = 'Transition';
      this.stage.addChild(this.scenes.transition);
    }

    // popup manager
    this.stage.addChild(this.popups.view);

    // focus manager
    this.focus.view.label = 'FocusManager';
    this.stage.addChild(this.focus.view);

    // is touch device
    return Promise.resolve();
  }

  private _addSplash() {
    if (this.scenes.splash.view) {
      this.scenes.splash.view.label = 'Splash';
      this.stage.addChild(this.scenes.splash.view);
    }
  }
}
