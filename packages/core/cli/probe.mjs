import { bgRed, bold, cyan, green, red, white, yellow } from 'kleur/colors';

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * `caper agent probe <url>` — drive a running Caper app through the
 * `window.Caper.automation` Playwright bridge. Boot detection, action
 * dispatch, state/context reads, and optional screenshot, all in one shot.
 */

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_VIEWPORT_W = 1280;
const DEFAULT_VIEWPORT_H = 720;
const DEFAULT_LOG_TAIL = 50;

/**
 * Parse the raw CLI arguments for `caper agent probe`.
 *
 * @param {string[]} args
 * @returns {{
 *   url: string,
 *   actions: { name: string, data?: unknown }[],
 *   until?: string,
 *   waitMs: number,
 *   timeoutMs: number,
 *   appId?: string,
 *   screenshot?: string,
 *   headed: boolean,
 *   json: boolean,
 *   viewport: { width: number, height: number }
 * }}
 */
export function parseProbeArgs(args) {
  const result = {
    url: '',
    actions: [],
    until: undefined,
    waitMs: 0,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    appId: undefined,
    screenshot: undefined,
    headed: false,
    json: false,
    viewport: { width: DEFAULT_VIEWPORT_W, height: DEFAULT_VIEWPORT_H },
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--action') {
      const next = args[++i];
      if (!next) throw new Error('Missing value for --action');
      const eq = next.indexOf('=');
      const name = eq >= 0 ? next.slice(0, eq) : next;
      const rawData = eq >= 0 ? next.slice(eq + 1) : undefined;
      let data;
      if (rawData !== undefined) {
        try {
          data = JSON.parse(rawData);
        } catch {
          throw new Error(`Invalid JSON data in --action ${JSON.stringify(next)}`);
        }
      }
      result.actions.push(data !== undefined ? { name, data } : { name });
    } else if (arg === '--until') {
      const next = args[++i];
      if (!next) throw new Error('Missing value for --until');
      result.until = next;
    } else if (arg === '--wait') {
      const next = args[++i];
      if (!next) throw new Error('Missing value for --wait');
      const ms = Number(next);
      if (!Number.isFinite(ms) || ms < 0) throw new Error(`Invalid --wait value: ${next}`);
      result.waitMs = ms;
    } else if (arg === '--timeout') {
      const next = args[++i];
      if (!next) throw new Error('Missing value for --timeout');
      const ms = Number(next);
      if (!Number.isFinite(ms) || ms < 0) throw new Error(`Invalid --timeout value: ${next}`);
      result.timeoutMs = ms;
    } else if (arg === '--app') {
      const next = args[++i];
      if (!next) throw new Error('Missing value for --app');
      result.appId = next;
    } else if (arg === '--screenshot') {
      const next = args[++i];
      if (!next) throw new Error('Missing value for --screenshot');
      result.screenshot = next;
    } else if (arg === '--headed') {
      result.headed = true;
    } else if (arg === '--json') {
      result.json = true;
    } else if (arg === '--viewport') {
      const next = args[++i];
      if (!next) throw new Error('Missing value for --viewport');
      const match = next.match(/^(\d+)x(\d+)$/i);
      if (!match) throw new Error(`Invalid --viewport value: ${next} (expected WxH)`);
      result.viewport = { width: Number(match[1]), height: Number(match[2]) };
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!result.url) {
      result.url = arg;
    } else {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }

    i++;
  }

  if (!result.url) {
    throw new Error('Missing required <url> argument');
  }

  return result;
}

function printUsage() {
  console.error(red('Usage: caper agent probe <url> [options]'));
  console.error('');
  console.error('Options:');
  console.error('  --action <name>[=<json>]   dispatch action(s) in order');
  console.error('  --until <js-predicate>     wait for state predicate to return true');
  console.error('  --wait <ms>                sleep after actions (default 0)');
  console.error('  --timeout <ms>             boot and until timeout (default 15000)');
  console.error('  --app <id>                 target a specific app');
  console.error('  --screenshot <path>        save a PNG screenshot');
  console.error('  --headed                   run in headed mode');
  console.error('  --json                     print JSON result only');
  console.error('  --viewport WxH             viewport size (default 1280x720)');
}

async function resolvePlaywright() {
  const pkgJson = path.join(process.cwd(), 'package.json');
  const require = createRequire(pkgJson);
  const resolved = require.resolve('playwright');
  const mod = await import(pathToFileURL(resolved).href);
  // Playwright's CJS entry re-exports via default when dynamically imported.
  return mod.default ?? mod;
}

/**
 * Run the `caper agent probe` command.
 *
 * @param {string[]} args
 */
export async function probe(args) {
  let parsed;
  try {
    parsed = parseProbeArgs(args);
  } catch (err) {
    console.error(bold(bgRed(white(` ${err.message} `))));
    printUsage();
    process.exit(1);
  }

  const {
    url,
    actions,
    until,
    waitMs,
    timeoutMs,
    appId,
    screenshot,
    headed,
    json,
    viewport,
  } = parsed;

  let playwright;
  try {
    playwright = await resolvePlaywright();
  } catch {
    console.error(
      red('playwright is not installed in the current project.'),
      'Run:',
      cyan('pnpm add -D playwright && npx playwright install chromium'),
    );
    process.exit(2);
  }

  const startTime = Date.now();
  const pageErrors = [];
  const consoleErrors = [];
  const sentActions = [];
  let bootTimedOut = false;
  let browser;
  let context;

  try {
    browser = await playwright.chromium.launch({ headless: !headed });
    context = await browser.newContext({ viewport });
    const page = await context.newPage();

    page.on('pageerror', (err) => {
      pageErrors.push(err.stack || err.message || String(err));
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    try {
      await page.goto(url, { timeout: timeoutMs });
      await page.waitForFunction(
        () => window.Caper && window.Caper.__readyApps && window.Caper.__readyApps.size > 0,
        null,
        { timeout: timeoutMs },
      );
    } catch (err) {
      bootTimedOut = true;
      throw err;
    }

    const evalResult = await page.evaluate(
      async ({ appId: requestedAppId, actions: actionsToSend, untilSrc, timeout, logTail }) => {
        const caper = window.Caper;
        const app = await caper.ready(requestedAppId || undefined);
        const resolvedAppId = app.config?.id || app.id || 'unknown';
        const automation = caper.automation?.[resolvedAppId];

        if (!automation) {
          return {
            appId: resolvedAppId,
            automation: false,
            context: undefined,
            state: undefined,
            actions: [],
            log: [],
          };
        }

        const dispatched = [];
        for (const { name, data } of actionsToSend) {
          automation.action(name, data);
          dispatched.push({ name, data });
        }

        if (untilSrc) {
          const predicate = new Function('return (' + untilSrc + ')')();
          await automation.waitFor(predicate, { timeoutMs: timeout });
        }

        const fullLog = automation.log || [];
        const log = fullLog.slice(-logTail);

        return {
          appId: resolvedAppId,
          automation: true,
          context: automation.getContext(),
          state: automation.getState(),
          actions: dispatched,
          log,
        };
      },
      { appId, actions, untilSrc: until, timeout: timeoutMs, logTail: DEFAULT_LOG_TAIL },
    );

    sentActions.push(...evalResult.actions);

    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    if (screenshot) {
      fs.mkdirSync(path.dirname(path.resolve(screenshot)), { recursive: true });
      await page.screenshot({ path: screenshot, type: 'png' });
    }

    const result = {
      url,
      appId: evalResult.appId,
      automation: evalResult.automation,
      context: evalResult.context,
      state: evalResult.state,
      actions: sentActions,
      log: evalResult.log,
      pageErrors,
      consoleErrors,
      screenshot,
      durationMs: Date.now() - startTime,
    };

    if (!screenshot) {
      delete result.screenshot;
    }

    let failed = false;
    let reason = '';
    if (pageErrors.length > 0) {
      failed = true;
      reason = `${pageErrors.length} page error(s)`;
    }

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(green(bold('✓ Probed')) + ` ${cyan(url)}`);
      console.log(`  ${yellow('app:')}        ${evalResult.appId}`);
      console.log(`  ${yellow('automation:')} ${evalResult.automation}`);
      console.log(`  ${yellow('actions:')}    ${sentActions.length}`);
      console.log(`  ${yellow('log:')}        ${evalResult.log.length} entries`);
      console.log(`  ${yellow('duration:')}   ${result.durationMs}ms`);
      if (pageErrors.length > 0) {
        console.error(red(`  ${pageErrors.length} page error(s)`));
      }
      if (consoleErrors.length > 0) {
        console.error(red(`  ${consoleErrors.length} console error(s)`));
      }
      if (screenshot) {
        console.log(`  ${yellow('screenshot:')} ${screenshot}`);
      }
      console.log('');
      console.log(JSON.stringify(result, null, 2));
    }

    if (failed) {
      console.error(red(`probe failed: ${reason}`));
      process.exit(1);
    }

    return result;
  } catch (err) {
    const result = {
      url,
      appId: appId || undefined,
      automation: false,
      context: undefined,
      state: undefined,
      actions: sentActions,
      log: [],
      pageErrors,
      consoleErrors,
      durationMs: Date.now() - startTime,
    };

    if (bootTimedOut) {
      result._reason = 'boot timed out';
    } else if (until && err?.message?.includes('timed out')) {
      result._reason = '--until predicate timed out';
    } else {
      result._reason = err?.message || String(err);
    }

    if (screenshot) {
      result.screenshot = screenshot;
    }

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error(bold(bgRed(white(` probe failed: ${result._reason} `))));
      console.error(red(err?.stack || err?.message || String(err)));
      if (pageErrors.length > 0) {
        console.error(red(`  ${pageErrors.length} page error(s)`));
      }
    }

    process.exit(1);
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}
