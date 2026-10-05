import { describe, expect, it } from 'vitest';
import type { PosterSkinId } from '../../../../types';
import { DEFAULT_NEW_SKIN, SKINS, chooseSkin, getSkin, orderSkins, readSkinOrder } from './skinRegistry';

const ids = (chosen: readonly string[]): PosterSkinId[] => orderSkins(chosen).map((s) => s.id);
const registry = SKINS.map((s) => s.id);

describe('skin order — the last chosen leads, the ones before it move back one', () => {
  it('the default leads until the athlete picks another, then the registry order', () => {
    expect(ids([])).toEqual([DEFAULT_NEW_SKIN, ...registry.filter((id) => id !== DEFAULT_NEW_SKIN)]);
  });

  it('choosing a skin puts it first and pushes everything that was ahead of it back by one', () => {
    const before = ids([]);
    const pick = before[4];
    const after = ids(chooseSkin([], pick));
    expect(after).toEqual([pick, ...before.slice(0, 4), ...before.slice(5)]);
  });

  it('choosing again from the middle of the row moves only the skins ahead of it', () => {
    const chosen = chooseSkin(chooseSkin(chooseSkin([], 'chalk'), 'ink'), 'foil');
    const before = ids(chosen);
    expect(before.slice(0, 3)).toEqual(['foil', 'ink', 'chalk']);
    const after = ids(chooseSkin(chosen, 'chalk'));
    expect(after).toEqual(['chalk', 'foil', 'ink', ...before.slice(3)]);
  });

  it('every skin is listed exactly once, and a retired skin in the stored list is skipped', () => {
    const order = ids(['retired-skin', 'chalk', 'chalk', DEFAULT_NEW_SKIN]);
    expect(order[0]).toBe('chalk');
    expect(new Set(order).size).toBe(SKINS.length);
    expect(order).toHaveLength(SKINS.length);
  });

  it('a user doc from before the order was kept starts from its one favourite', () => {
    expect(readSkinOrder(undefined, 'chalk')).toEqual(['chalk']);
    expect(readSkinOrder(['ink', 3, 'foil'], 'chalk')).toEqual(['ink', 'foil']);
    expect(readSkinOrder(undefined, undefined)).toBeUndefined();
  });

  it('a poster saved before skins were stamped keeps the look it always had', () => {
    expect(getSkin(undefined).id).toBe('slab');
  });
});
