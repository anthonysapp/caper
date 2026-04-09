import { describe, expect, it, vi } from 'vitest';
import { Signal } from './Signal';

describe('Signal', () => {
  it('emits to connected handlers', () => {
    const s = new Signal<(n: number) => void>();
    const h = vi.fn();
    s.connect(h);
    s.emit(1);
    s.emit(2);
    expect(h).toHaveBeenCalledTimes(2);
    expect(h).toHaveBeenNthCalledWith(2, 2);
  });

  it('connectOnce disconnects after the first emit', () => {
    const s = new Signal<() => void>();
    const h = vi.fn();
    s.connectOnce(h);
    s.emit();
    s.emit();
    s.emit();
    expect(h).toHaveBeenCalledTimes(1);
  });

  it('connectNTimes disconnects after N emits', () => {
    const s = new Signal<() => void>();
    const h = vi.fn();
    s.connectNTimes(h, 3);
    for (let i = 0; i < 5; i++) s.emit();
    expect(h).toHaveBeenCalledTimes(3);
  });

  it('respects order priorities (higher order runs later)', () => {
    const s = new Signal<() => void>();
    const calls: string[] = [];
    s.connect(() => calls.push('normal'), 'normal');
    s.connect(() => calls.push('high'), 'high');
    s.connect(() => calls.push('low'), 'low');
    s.emit();
    expect(calls).toEqual(['high', 'normal', 'low']);
  });

  it('disconnectAll removes all handlers', () => {
    const s = new Signal<() => void>();
    const a = vi.fn();
    const b = vi.fn();
    s.connect(a);
    s.connect(b);
    s.disconnectAll();
    s.emit();
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });
});
