import { describe, it, expect } from 'vitest';
import { safariShareLocation } from './homeScreenApp';

const IPHONE_SAFARI_18 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPHONE_SAFARI_26 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1';
const IPHONE_INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 380.0.0.0.0';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36';

describe('safariShareLocation', () => {
  it('finds Share in the bottom bar on Safari 18 and earlier', () => {
    expect(safariShareLocation(IPHONE_SAFARI_18)).toBe('toolbar');
  });

  it('finds Share behind ••• on Safari 26, whose UA still says iOS 18_6', () => {
    expect(safariShareLocation(IPHONE_SAFARI_26)).toBe('menu');
  });

  it('recognises an iPad asking for the desktop site by its touch points', () => {
    expect(safariShareLocation(IPAD_DESKTOP_SAFARI, 5)).toBe('toolbar');
    expect(safariShareLocation(IPAD_DESKTOP_SAFARI, 0)).toBeNull();
  });

  it('stays quiet in other iOS browsers, in-app browsers and on Android', () => {
    expect(safariShareLocation(IPHONE_CHROME)).toBeNull();
    expect(safariShareLocation(IPHONE_INSTAGRAM)).toBeNull();
    expect(safariShareLocation(ANDROID_CHROME)).toBeNull();
  });
});
