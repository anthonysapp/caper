import { describe, expect, it, vi } from 'vitest';
import { Owned3D } from './owned';

describe('Owned3D', () => {
  it('updates live players with the same ticker and drops destroyed ones', () => {
    const owned = new Owned3D();
    const ticker = { deltaMS: 16 };
    const live = { destroyed: false, update: vi.fn() };
    const gone = { destroyed: true, update: vi.fn() };
    owned.player(live);
    owned.player(gone);
    owned.update(ticker);
    expect(live.update).toHaveBeenCalledWith(ticker);
    expect(gone.update).not.toHaveBeenCalled();
    live.destroyed = true;
    owned.update(ticker);
    expect(live.update).toHaveBeenCalledTimes(1);
  });

  it('destroys only recorded geometry and materials once', () => {
    const owned = new Owned3D();
    const geometry = { destroy: vi.fn() };
    const material = { destroy: vi.fn() };
    const raw = { destroy: vi.fn() };
    const build = vi.fn(() => geometry);
    expect(owned.geometry('box', build)).toBe(geometry);
    expect(owned.geometry('box', build)).toBe(geometry);
    expect(build).toHaveBeenCalledTimes(1);
    expect(owned.material(material)).toBe(material);
    owned.material(material);
    owned.destroy();
    owned.destroy();
    expect(geometry.destroy).toHaveBeenCalledTimes(1);
    expect(material.destroy).toHaveBeenCalledTimes(1);
    expect(raw.destroy).not.toHaveBeenCalled();
  });
});
