export interface CelebrationStickerConfig {
  runDistanceStickerMinMeters: number;
  rowDistanceStickerMinMeters: number;
  bikeDistanceStickerMinMeters: number;
  calorieStickerMinCalories: number;
  chipperMoveTimeStickerMinMinutes: number;
}

export const DEFAULT_CELEBRATION_STICKER_CONFIG: CelebrationStickerConfig = {
  runDistanceStickerMinMeters: 2000,
  rowDistanceStickerMinMeters: 2000,
  bikeDistanceStickerMinMeters: 5000,
  calorieStickerMinCalories: 80,
  chipperMoveTimeStickerMinMinutes: 20,
};

const REMOTE_CONFIG_KEYS = {
  runDistanceStickerMinMeters: 'celebration_run_distance_sticker_min_m',
  rowDistanceStickerMinMeters: 'celebration_row_distance_sticker_min_m',
  bikeDistanceStickerMinMeters: 'celebration_bike_distance_sticker_min_m',
  calorieStickerMinCalories: 'celebration_calorie_sticker_min_cal',
  chipperMoveTimeStickerMinMinutes: 'celebration_chipper_move_time_sticker_min_min',
} as const;

let cachedConfig: CelebrationStickerConfig | null = null;

function fallbackNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function fetchCelebrationStickerConfig(): Promise<CelebrationStickerConfig> {
  if (cachedConfig) return cachedConfig;

  try {
    // Lazy-loaded so importing this module (e.g. from the pure celebration helpers or the
    // poster-corpus Node harness) never initializes Firebase — only the first fetch does.
    const [{ fetchAndActivate, getRemoteConfig, getValue, isSupported }, { app }] =
      await Promise.all([import('firebase/remote-config'), import('./firebase')]);

    if (!(await isSupported())) {
      cachedConfig = DEFAULT_CELEBRATION_STICKER_CONFIG;
      return cachedConfig;
    }

    const remoteConfig = getRemoteConfig(app);
    remoteConfig.settings.minimumFetchIntervalMillis = 60 * 60 * 1000;
    remoteConfig.defaultConfig = {
      [REMOTE_CONFIG_KEYS.runDistanceStickerMinMeters]: DEFAULT_CELEBRATION_STICKER_CONFIG.runDistanceStickerMinMeters,
      [REMOTE_CONFIG_KEYS.rowDistanceStickerMinMeters]: DEFAULT_CELEBRATION_STICKER_CONFIG.rowDistanceStickerMinMeters,
      [REMOTE_CONFIG_KEYS.bikeDistanceStickerMinMeters]: DEFAULT_CELEBRATION_STICKER_CONFIG.bikeDistanceStickerMinMeters,
      [REMOTE_CONFIG_KEYS.calorieStickerMinCalories]: DEFAULT_CELEBRATION_STICKER_CONFIG.calorieStickerMinCalories,
      [REMOTE_CONFIG_KEYS.chipperMoveTimeStickerMinMinutes]: DEFAULT_CELEBRATION_STICKER_CONFIG.chipperMoveTimeStickerMinMinutes,
    };

    await fetchAndActivate(remoteConfig);

    cachedConfig = {
      runDistanceStickerMinMeters: fallbackNumber(
        getValue(remoteConfig, REMOTE_CONFIG_KEYS.runDistanceStickerMinMeters).asNumber(),
        DEFAULT_CELEBRATION_STICKER_CONFIG.runDistanceStickerMinMeters,
      ),
      rowDistanceStickerMinMeters: fallbackNumber(
        getValue(remoteConfig, REMOTE_CONFIG_KEYS.rowDistanceStickerMinMeters).asNumber(),
        DEFAULT_CELEBRATION_STICKER_CONFIG.rowDistanceStickerMinMeters,
      ),
      bikeDistanceStickerMinMeters: fallbackNumber(
        getValue(remoteConfig, REMOTE_CONFIG_KEYS.bikeDistanceStickerMinMeters).asNumber(),
        DEFAULT_CELEBRATION_STICKER_CONFIG.bikeDistanceStickerMinMeters,
      ),
      calorieStickerMinCalories: fallbackNumber(
        getValue(remoteConfig, REMOTE_CONFIG_KEYS.calorieStickerMinCalories).asNumber(),
        DEFAULT_CELEBRATION_STICKER_CONFIG.calorieStickerMinCalories,
      ),
      chipperMoveTimeStickerMinMinutes: fallbackNumber(
        getValue(remoteConfig, REMOTE_CONFIG_KEYS.chipperMoveTimeStickerMinMinutes).asNumber(),
        DEFAULT_CELEBRATION_STICKER_CONFIG.chipperMoveTimeStickerMinMinutes,
      ),
    };
  } catch (error) {
    console.warn('Failed to load celebration sticker config, using defaults:', error);
    cachedConfig = DEFAULT_CELEBRATION_STICKER_CONFIG;
  }

  return cachedConfig;
}
