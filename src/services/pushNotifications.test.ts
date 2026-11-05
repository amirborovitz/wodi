import { describe, expect, it } from 'vitest';
import { pushReadiness, type PushEnvironment } from './pushNotifications';

const android: PushEnvironment = { configured: true, hasPush: true, isIOS: false, standalone: false, permission: 'default' };

describe('pushReadiness', () => {
  it('asks where it can', () => {
    expect(pushReadiness(android)).toBe('ask');
  });

  it('knows on and blocked', () => {
    expect(pushReadiness({ ...android, permission: 'granted' })).toBe('on');
    expect(pushReadiness({ ...android, permission: 'denied' })).toBe('blocked');
  });

  it('tells an iPhone in a Safari tab to add Wodi to the Home Screen first', () => {
    expect(pushReadiness({ configured: true, hasPush: false, isIOS: true, standalone: false, permission: null })).toBe('install-first');
  });

  it('is unsupported on an installed iPhone too old for push, or when the app has no push key', () => {
    expect(pushReadiness({ configured: true, hasPush: false, isIOS: true, standalone: true, permission: null })).toBe('unsupported');
    expect(pushReadiness({ ...android, configured: false })).toBe('unsupported');
  });
});
