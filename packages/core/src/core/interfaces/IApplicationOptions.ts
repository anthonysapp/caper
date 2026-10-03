import type {
  ActionMap,
  BreakpointsConfig,
  FocusManagerPluginOptions,
  GesturePluginOptions,
  i18nOptions,
  InputManagerOptions,
  LoadSceneMethod,
  ResizerPluginOptions,
  SplashOptions,
} from '../../plugins';
import type {
  AppTypeOverrides,
  AssetLoadingOptions,
  LoggerMode,
  SceneImportList,
  SceneImportListItem,
} from '../../utils';

import type { ApplicationOptions, TextDropShadow } from 'pixi.js';
import type { IScene, ISceneTransition, SceneTransition } from '../../display';
import type { TextStyle } from '../../mixins/factory/props';
import type { CaptionsOptions } from '../../plugins/captions';
import { GSAPPluginOptions } from '../../plugins/GSAPPlugin';
import type { IDataAdapterOptions } from '../../plugins/DataAdapter';
import type { OrientationConfig } from '../../utils/orientation';
import type { PluginConfig } from '../config';
import { IApplication } from './IApplication';

export interface IApplicationOptions extends ApplicationOptions {
  id: string;
  application?: new (...args: any[]) => IApplication;
  resizeToContainer: boolean;
  container: HTMLElement;
  logger: LoggerMode;
  useStore: boolean;
  useSpine: boolean;
  useLayout: boolean;
  useVoiceover: boolean;
  /**
   * Add `vite-plugin-wasm` to the Vite config. Only needed if your project
   * imports a `.wasm` module directly (`import init from './foo.wasm'`) —
   * runtime-fetched wasm (Rive's `locateFile`, pixi's KTX/basis transcoders)
   * and Vite's native `?init` / `?url` imports work without it.
   *
   * Build-time only: read out of `caper.config.ts` by an AST parse before the
   * Vite config is built, so it has no effect on the running Application and
   * changing it requires a dev-server restart.
   *
   * @default false
   */
  useWasm?: boolean;
  /**
   * Lock the game to one orientation on every target. Unset means no lock.
   * `'portrait'` / `'landscape'` is shorthand for `{ lock: 'portrait' }` etc.
   *
   * - `caper native android` sets `android:screenOrientation` on the
   *   MainActivity (`portrait`, or `sensorLandscape` for landscape).
   * - `caper native init` opens a 450x800 desktop window for portrait
   *   (1280x720 otherwise).
   * - The PWA web manifest's `orientation` defaults to the lock.
   * - At runtime, on a mobile browser (never desktop, never Tauri), the
   *   `orientation` plugin shows a "rotate your device" overlay and pauses the
   *   game while the device is held the wrong way. `overlay` restyles it
   *   (`text` / `background` / `color` / `fontFamily`), adds a `className`, or
   *   replaces it (`element`); `overlay: false` turns off the overlay and its
   *   pause, and `app.orientation.onMismatchChanged` still fires.
   *
   * The build and the CLI read the lock with an AST parse, so write the lock
   * (the string, or `lock` in the object) as a string literal.
   */
  orientation?: OrientationConfig;
  /**
   * Enable the `window.Caper.automation[id]` facade for this app regardless of
   * environment. Automation is also auto-enabled in dev or when
   * `VITE_CAPER_AUTOMATION === 'true'`.
   */
  automation?: boolean;
  defaultTextStyle: Partial<TextStyle>;
  defaultDropShadow: TextDropShadow;
  gsap: Partial<GSAPPluginOptions>;
  data: Partial<IDataAdapterOptions>;
  plugins: PluginConfig[];
  assets: AssetLoadingOptions;
  sceneImportList: SceneImportListItem<IScene>[];
  scenes: SceneImportList<IScene>;
  sceneGroupOrder: string[];
  scenesLocation: string;
  actions: Partial<ActionMap>;
  input: Partial<InputManagerOptions>;
  gesture?: Partial<GesturePluginOptions>;
  focus: Partial<FocusManagerPluginOptions>;
  splash: Partial<SplashOptions>;
  defaultScene: AppTypeOverrides['Scenes'];
  sceneTransition: ISceneTransition | typeof SceneTransition;
  defaultSceneLoadMethod: LoadSceneMethod;
  showSceneDebugMenu: boolean;
  useHash: boolean;
  i18n: Partial<i18nOptions>;
  resizer: Partial<ResizerPluginOptions>;
  breakpoints: Partial<BreakpointsConfig>;
  captions: Partial<CaptionsOptions>;
  showStats: boolean;
}
