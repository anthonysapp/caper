import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockApp = vi.hoisted(() => ({
  ticker: { addOnce: (cb: () => void) => cb() },
}));

// PopupManagerPlugin transitively imports Application → Pixi display graph. Stub it.
vi.mock('../core', () => ({
  coreFunctionRegistry: {},
  coreSignalRegistry: {},
}));
vi.mock('../core/Application', () => ({
  Application: { getInstance: () => mockApp },
}));

// Evaluating the table registers it into mixins/factory/defaults, which the
// plugin's `view` Container reads lazily on construction.
import '../mixins/factory/const';
import { PopupManagerPlugin } from './PopupManagerPlugin';

function makeFakePopup() {
  return {
    beforeHide: vi.fn(),
    hide: vi.fn().mockResolvedValue(undefined),
    end: vi.fn(),
    restoreActionContext: vi.fn(),
  };
}

describe('PopupManagerPlugin removeAllPopups', () => {
  let plugin: PopupManagerPlugin;

  beforeEach(() => {
    plugin = new PopupManagerPlugin();
    vi.spyOn(plugin.view, 'removeChild').mockReturnValue(undefined as never);
  });

  it('clears active popups and the current id when animating', async () => {
    const first = makeFakePopup();
    const second = makeFakePopup();
    (plugin as any)._activePopups.set('first', first);
    (plugin as any)._activePopups.set('second', second);
    (plugin as any)._currentPopupId = 'second';

    plugin.removeAllPopups(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(first.hide).toHaveBeenCalledTimes(1);
    expect(second.hide).toHaveBeenCalledTimes(1);
    expect(plugin.hasActivePopups).toBe(false);
    expect(plugin.currentPopupId).toBeUndefined();
  });
});
