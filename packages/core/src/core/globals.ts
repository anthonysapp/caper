import type { IActionsPlugin } from '../plugins/actions';
import type { Application } from './Application';
import type { IApplication } from './interfaces';

/**
 * A single entry in an app's automation log ring buffer.
 */
export interface AutomationLogEntry {
  t: number;
  kind: 'action' | 'state' | 'context';
  name?: string;
  data?: unknown;
}

/**
 * The automation facade exposed on `window.Caper.automation[appId]` for
 * Playwright / agent drivers. Only present when automation is enabled (see the
 * gating rules in {@link registerCaperApp}).
 */
export interface ICaperAutomation {
  readonly appId: string;
  readonly log: readonly AutomationLogEntry[];
  action(name: string, data?: unknown): void;
  getContext(): string;
  getState(): unknown;
  registerStateGetter(fn: () => unknown): void;
  notifyStateChanged(state: unknown): void;
  waitFor(predicate: (state: unknown) => boolean, opts?: { timeoutMs?: number }): Promise<unknown>;
}

const LOG_CAP = 200;
const FALLBACK_APP_ID = 'CaperApplication';

interface CaperReadyResolver {
  resolve: (app: IApplication) => void;
  promise: Promise<IApplication>;
}

interface CaperGlobalInternal {
  apps: Map<string, IApplication>;
  app?: IApplication;
  automation: Record<string, ICaperAutomation>;
  ready: (id?: string) => Promise<IApplication>;
  __runtimeManaged?: boolean;
  /** internal: keyed ready resolvers */
  __readyResolvers?: Map<string, CaperReadyResolver>;
  /** internal: ids of apps that have fully finished booting (signalCaperReady) */
  __readyApps?: Set<string>;
  [key: string]: unknown;
}

/**
 * Guarded dev-env check. Access to `import.meta.env` must stay inside a
 * function (never at module top level) so the built entry can be evaluated in
 * plain Node during SSR config loading.
 */
function isDevEnv(): boolean {
  try {
    return typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true;
  } catch {
    return false;
  }
}

function automationEnvFlag(): boolean {
  try {
    return typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_CAPER_AUTOMATION === 'true';
  } catch {
    return false;
  }
}

const FIRST_APP_KEY = '__first__';

/**
 * Lazily create/return the `globalThis.Caper` object with the automation +
 * discovery surface installed. No browser globals are touched at module load
 * time — everything happens inside this function.
 */
function ensureCaperGlobal(): CaperGlobalInternal {
  const g = globalThis as any;
  const caper: CaperGlobalInternal = (g.Caper ||= {} as CaperGlobalInternal);

  if (!(caper.apps instanceof Map)) {
    caper.apps = new Map<string, IApplication>();
  }
  if (typeof caper.automation !== 'object' || caper.automation === null) {
    caper.automation = {};
  }
  if (!(caper.__readyResolvers instanceof Map)) {
    caper.__readyResolvers = new Map<string, CaperReadyResolver>();
  }
  if (!(caper.__readyApps instanceof Set)) {
    caper.__readyApps = new Set<string>();
  }

  if (typeof caper.ready !== 'function') {
    caper.ready = (id?: string): Promise<IApplication> => {
      const resolvers = caper.__readyResolvers as Map<string, CaperReadyResolver>;
      const readyApps = caper.__readyApps as Set<string>;
      // Only resolve immediately for apps that have FINISHED booting
      // (signalCaperReady) — registration alone happens earlier, in create(),
      // before main.ts has run.
      if (id && readyApps.has(id)) {
        return Promise.resolve(caper.apps.get(id)!);
      }
      // No id: resolve with the first fully-booted app if one exists.
      if (!id && readyApps.size > 0) {
        const firstReadyId = readyApps.values().next().value as string;
        return Promise.resolve(caper.apps.get(firstReadyId)!);
      }
      const key = id ?? FIRST_APP_KEY;
      let entry = resolvers.get(key);
      if (!entry) {
        let resolve!: (app: IApplication) => void;
        const promise = new Promise<IApplication>((res) => {
          resolve = res;
        });
        entry = { resolve, promise };
        resolvers.set(key, entry);
      }
      return entry.promise;
    };
  }

  return caper;
}

function appIdOf(app: IApplication): string {
  return (app.config?.id as string) || FALLBACK_APP_ID;
}

function buildAutomation(app: IApplication): ICaperAutomation {
  const appId = appIdOf(app);
  const log: AutomationLogEntry[] = [];
  let stateGetter: (() => unknown) | undefined;
  const pending: Array<{ predicate: (state: unknown) => boolean; resolve: (v: unknown) => void }> = [];

  const push = (entry: AutomationLogEntry) => {
    log.push(entry);
    if (log.length > LOG_CAP) {
      log.splice(0, log.length - LOG_CAP);
    }
  };

  const getState = (): unknown => (stateGetter ? stateGetter() : undefined);

  const checkPending = (state: unknown) => {
    if (pending.length === 0) {
      return;
    }
    for (let i = pending.length - 1; i >= 0; i--) {
      let matched = false;
      try {
        matched = pending[i].predicate(state);
      } catch {
        matched = false;
      }
      if (matched) {
        const [entry] = pending.splice(i, 1);
        entry.resolve(state);
      }
    }
  };

  const facade: ICaperAutomation = {
    appId,
    get log() {
      return log as readonly AutomationLogEntry[];
    },
    action(name: string, data?: unknown) {
      app.sendAction(name as any, data);
    },
    getContext() {
      return String(app.actionContext);
    },
    getState,
    registerStateGetter(fn: () => unknown) {
      stateGetter = fn;
    },
    notifyStateChanged(state: unknown) {
      push({ t: Date.now(), kind: 'state', data: state });
      checkPending(state);
    },
    waitFor(predicate: (state: unknown) => boolean, opts?: { timeoutMs?: number }) {
      // Check immediately against current state.
      const current = getState();
      try {
        if (predicate(current)) {
          return Promise.resolve(current);
        }
      } catch {
        // ignore predicate errors on the immediate check
      }
      return new Promise<unknown>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const entry = {
          predicate,
          resolve: (v: unknown) => {
            if (timer) {
              clearTimeout(timer);
            }
            resolve(v);
          },
        };
        pending.push(entry);
        if (opts?.timeoutMs != null) {
          timer = setTimeout(() => {
            const idx = pending.indexOf(entry);
            if (idx >= 0) {
              pending.splice(idx, 1);
            }
            reject(new Error(`waitFor timed out after ${opts.timeoutMs}ms`));
          }, opts.timeoutMs);
        }
      });
    },
  };

  // Subscribe to action dispatches + context changes for the log, and re-check
  // pending waitFor predicates after each dispatched action.
  const actions = app.getPlugin<IActionsPlugin>('actions');
  if (actions) {
    actions.onActionDispatched?.connect((detail) => {
      push({ t: Date.now(), kind: 'action', name: String(detail.id), data: detail.data });
      checkPending(getState());
    });
    actions.onActionContextChanged.connect((context) => {
      push({ t: Date.now(), kind: 'context', name: String(context) });
    });
  }

  return facade;
}

/**
 * Register an app with the global `Caper` discovery surface. Adds it to
 * `Caper.apps` under its config id, sets `Caper.app` to the most-recently
 * created app, and — when automation is enabled — builds the automation facade
 * and stores it at `Caper.automation[id]` (and on the app instance).
 *
 * Automation is enabled when any of: dev env, `config.automation === true`, or
 * `VITE_CAPER_AUTOMATION === 'true'`.
 */
export function registerCaperApp(app: IApplication): void {
  const caper = ensureCaperGlobal();
  const id = appIdOf(app);
  caper.apps.set(id, app);
  caper.app = app;

  const automationEnabled = isDevEnv() || app.config?.automation === true || automationEnvFlag();
  if (automationEnabled) {
    const facade = buildAutomation(app);
    caper.automation[id] = facade;
    (app as Application).automation = facade;
  }
}

/**
 * Resolve any pending `Caper.ready()` promises for this app — both the
 * id-keyed resolver and the first-app resolver.
 */
export function signalCaperReady(app: IApplication): void {
  const caper = ensureCaperGlobal();
  const id = appIdOf(app);
  (caper.__readyApps as Set<string>).add(id);
  const resolvers = caper.__readyResolvers as Map<string, CaperReadyResolver>;

  const idEntry = resolvers.get(id);
  if (idEntry) {
    idEntry.resolve(app);
    resolvers.delete(id);
  }
  const firstEntry = resolvers.get(FIRST_APP_KEY);
  if (firstEntry) {
    firstEntry.resolve(app);
    resolvers.delete(FIRST_APP_KEY);
  }
}
