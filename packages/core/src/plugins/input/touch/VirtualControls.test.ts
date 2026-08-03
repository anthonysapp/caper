import { describe, expect, it, vi } from 'vitest';

// VirtualControls reaches the app through Application.getInstance(). Stub it.
// The stub app is filled in after the imports (getInstance is only called lazily).
const holder = vi.hoisted(() => ({ app: null as any }));
vi.mock('../../../core/Application', () => ({
  Application: { getInstance: () => holder.app },
}));

import { Signal } from '../../../signals';
import { VirtualControls } from './VirtualControls';

describe('VirtualControls', () => {
  it('stops reacting to action context changes after destroy', () => {
    const onActionContextChanged = new Signal<(context: string) => void>();
    holder.app = {
      signal: { onActionContextChanged },
      ticker: { add: vi.fn(), remove: vi.fn() },
      actionsPlugin: { getActions: () => ({}) },
      actionContext: 'default',
    };

    const controls = new VirtualControls();
    const sortActions = vi.fn();
    (controls as any)._sortActions = sortActions;

    controls.initialize({});
    const callsAfterInit = sortActions.mock.calls.length;

    onActionContextChanged.emit('menu');
    expect(sortActions).toHaveBeenCalledTimes(callsAfterInit + 1);

    controls.destroy();

    onActionContextChanged.emit('game');
    expect(sortActions).toHaveBeenCalledTimes(callsAfterInit + 1);
  });
});
