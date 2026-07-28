import {
  ActionMap,
  BreakpointsConfig,
  FocusManagerPluginOptions,
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
import { TextStyle } from '../../mixins';
import type { CaptionsOptions } from '../../plugins/captions';
import { GSAPPluginOptions } from '../../plugins/GSAPPlugin';
import type { IDataAdapterOptions } from '../../plugins/DataAdapter';
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
