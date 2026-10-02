import { describe, expect, it } from 'vitest';
import { DEFAULT_NEW_SKIN, SKINS, getSkin, orderSkins } from './skinRegistry';

describe('skin order — the favourite leads the picker', () => {
  it('Sun leads until the athlete picks another', () => {
    expect(DEFAULT_NEW_SKIN).toBe('sun');
    expect(orderSkins(undefined)[0].id).toBe('sun');
  });

  it('their pick leads from then on, Sun right behind it — never last — and the rest keep the registry order', () => {
    const order = orderSkins('chalk').map((s) => s.id);
    expect(order.slice(0, 2)).toEqual(['chalk', 'sun']);
    expect(order.slice(2)).toEqual(SKINS.map((s) => s.id).filter((id) => id !== 'chalk' && id !== 'sun'));
    expect(new Set(order).size).toBe(SKINS.length);
  });

  it('Sun as the favourite is listed once', () => {
    const order = orderSkins('sun').map((s) => s.id);
    expect(order[0]).toBe('sun');
    expect(order.filter((id) => id === 'sun')).toHaveLength(1);
    expect(order).toHaveLength(SKINS.length);
  });

  it('a poster saved before skins were stamped keeps the look it always had', () => {
    expect(getSkin(undefined).id).toBe('slab');
  });
});
