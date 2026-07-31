import { type RegisterSWOptions } from 'vite-plugin-pwa/types';
import { sayHello } from '../hello';
import type { PluginListItem } from '../plugins';
import type { AppTypeOverrides, SceneImportListItem } from '../utils';
import { triggerViteError } from '../utils/vite';
import { checkWebGL } from '../webgl-check';
import { Application } from './Application';
import { registerCaperApp, signalCaperReady, type ICaperAutomation } from './globals';
import type { IApplication } from './interfaces';
import { AppConfig } from './types';

type App = AppTypeOverrides['App'];

/**
 * The `Caper.pwa` facade installed by the vite preset's runtime snippet. Reachable
 * from game code as `app.pwa`, which is `undefined` when the app was built without
 * the `pwa` option.
 *
 * Two timing rules matter:
 *
 * - `beforeinstallprompt` often fires before any scene exists, and signals do not
 *   replay. UI that offers an install button must check `app.pwa?.canInstall` when
 *   it mounts AND connect to `app.onPwaInstallAvailable` for the later case.
 * - Browsers only honour {@link CaperPWA.promptInstall} from inside a user gesture.
 *   Call it from a click/tap handler — an overlay with an Install button. Calling it
 *   from a timer, a scene transition, or a game-over event is silently ignored.
 */
export interface CaperPWA {
  readonly info: any;
  register: () => void;
  onRegisteredSW: (swScriptUrl: string) => void;
  offlineReady: () => void;
  /** Called when a new build is waiting. Defaults to caper's update banner; assign to replace it. */
  onNeedRefresh?: () => void;
  onRegisterError?: (error: any) => void;

  /** True once a new build is waiting to take over. */
  updateAvailable: boolean;
  /** Activate the waiting worker; the page reloads once it takes control. */
  applyUpdate: () => void;

  /** True once the browser has offered an install prompt to stash. */
  canInstall: boolean;
  /** Called when the browser offers the install prompt. */
  onCanInstall?: () => void;
  /** Called after the app is installed. */
  onInstalled?: () => void;
  /** Show the stashed install prompt. Resolves null when there is nothing to show. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | null>;
}
interface CaperGlobal {
  APP_NAME: string;
  APP_VERSION: string | number;

  readonly sceneList: SceneImportListItem<any>[];
  readonly pluginsList: PluginListItem[];

  get: (key?: string) => any;
  // pwa
  pwa: CaperPWA;

  // app discovery + automation
  apps: Map<string, IApplication>;
  app?: IApplication;
  ready(id?: string): Promise<IApplication>;
  automation: Record<string, ICaperAutomation>;
  __runtimeManaged?: boolean;
}

declare global {
  const Caper: CaperGlobal;
  const registerSW: (options: RegisterSWOptions) => void;
  interface Window {
    Caper: CaperGlobal;
  }
}

export const DEFAULT_GAME_CONTAINER_ID = 'caper-game-container';

export function createContainer(id: string) {
  const container = document.createElement('div');
  container.setAttribute('id', id);
  document.body.appendChild(container);
  return container;
}

export async function documentReady() {
  return new Promise((resolve) => {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      resolve(true);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        resolve(true);
      });
    }
  });
}

function addErrorHandler() {
  // This guard ensures these listeners only run during development
  if (import.meta.env.DEV) {
    /**
     * Listen for standard runtime errors that are not caught.
     */
    window.addEventListener('error', (event) => {
      // Prevent the default browser console error log
      event.preventDefault();

      triggerViteError({
        message: event.message,
        // The error object might contain a more detailed stack trace
        stack: event.error?.stack,
        id: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    });

    /**
     * Listen for unhandled promise rejections (e.g., from async functions).
     */
    window.addEventListener('unhandledrejection', (event) => {
      // Prevent the default browser console error log
      event.preventDefault();

      const error = event.reason;

      // The 'reason' can be any value, so we handle Error objects specifically
      if (error instanceof Error) {
        triggerViteError({
          message: error.message,
          stack: error.stack,
          // Note: stack parsing would be needed to get file/line for promise rejections
        });
      } else {
        // Handle cases where a non-error value is rejected
        triggerViteError({
          message: `Unhandled promise rejection: ${String(event.reason)}`,
        });
      }
    });
  }
}

export async function create(
  config: Partial<AppConfig> = { id: 'CaperApplication' },
  domElement: string | Window | HTMLElement = DEFAULT_GAME_CONTAINER_ID,
  speak: boolean = true,
): Promise<App> {
  await documentReady();
  checkWebGL();
  if (speak) {
    sayHello();
  }
  addErrorHandler();
  let el: HTMLElement | null = null;
  if (typeof domElement === 'string') {
    el = document.getElementById(domElement);
    if (!el) {
      el = createContainer(domElement);
    }
  } else if (domElement instanceof HTMLElement) {
    el = domElement;
  } else if (domElement === window) {
    el = document.body;
  }
  if (!el) {
    // no element to use
    throw new Error(
      'You passed in a DOM Element, but none was found. If you instead pass in a string, a container will be created for you, using the string for its id.',
    );
  }
  if (config.resizeToContainer) {
    config.resizeTo = el;
  }

  if (config.useLayout) {
    config.layout = {
      // @ts-expect-error some config stuff isn't typed right in @pixi/layout
      autoUpdate: false,
      enableDebug: false,
      debugModificationCount: 0,
      throttle: 100,
    };
  }

  config.container = el;
  const ApplicationClass = config.application || Application;
  const instance = new ApplicationClass();
  await instance.initialize(config, el);

  if (config.useLayout) {
    instance.stage.layout = {
      position: 'absolute',
      width: '100%',
      height: '100%',
    };
  }

  // ensure all plugins are initialized
  // run framework post-init: the plugin loop + core wiring, then the user hook
  await instance._postInitialize();

  // register with the global Caper discovery/automation surface
  registerCaperApp(instance as unknown as IApplication);
  // when not driven by the vite runtime (which signals readiness itself after
  // main.ts), signal readiness here so direct create() usage still resolves
  // Caper.ready()
  if (!(globalThis as any).Caper?.__runtimeManaged) {
    signalCaperReady(instance as unknown as IApplication);
  }

  // return the app instance
  return instance as App;
}
