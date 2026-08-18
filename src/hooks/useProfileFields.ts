import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { UserProfileUpdate } from '../context/AuthContext';
import { INSTAGRAM_MAX_LENGTH, normalizeInstagram } from '../utils/instagram';
import type { User } from '../types';

/**
 * The profile form's state and persistence.
 *
 * Every field is held as a string because every field is a text input — parsing
 * and validation happen once, on save, rather than fighting the athlete
 * mid-keystroke. There is no Save button: the screen is a list of values, not a
 * form to submit, so a blur (or a tap on a choice) is the commit.
 */

export type Sex = 'male' | 'female' | 'other' | 'prefer_not_to_say';

export const SEX_OPTIONS: readonly { value: Sex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export interface ProfileFields {
  displayName: string;
  gym: string;
  location: string;
  instagram: string;
  birthYear: string;
  weight: string;
  sex: string;
}

export type ProfileFieldKey = keyof ProfileFields;

export type ProfileErrors = Partial<Record<ProfileFieldKey, string>>;

/**
 * The three the app cannot work without, and what to say when one is left
 * blank: the name goes on every poster, the weight is the bodyweight EP and
 * volume are measured against, and the sex drives the Rx weight and calorie
 * prefill on every future log. Everything else is decoration the athlete can
 * leave blank forever.
 *
 * This map is the only definition of "required" — the screen asks it which rows
 * to mark rather than keeping its own list to drift out of step.
 */
const REQUIRED_MESSAGES: Partial<Record<ProfileFieldKey, string>> = {
  displayName: 'Add your name',
  weight: 'Add your weight in kg',
  sex: 'Pick one',
};

export function isRequiredField(key: ProfileFieldKey): boolean {
  return REQUIRED_MESSAGES[key] !== undefined;
}

/** Caps are enforced on the input too — these are the message-side limits. */
export const NAME_MAX_LENGTH = 30;
export const GYM_MAX_LENGTH = 40;
export const LOCATION_MAX_LENGTH = 60;

const MIN_BIRTH_YEAR = 1900;
/** Nobody logging a metcon was born last year — a typo, not a birth year. */
const MIN_AGE_YEARS = 10;
const MIN_WEIGHT_KG = 25;
const MAX_WEIGHT_KG = 300;

/** Blur fires before a tap on the next row lands, so the write waits that out. */
const SAVE_DEBOUNCE_MS = 300;
/** How long a row stays flagged as just-saved. */
const SAVED_FLASH_MS = 1500;

/**
 * The one place a value is judged. Both the messages and the write guards read
 * from it, so a field can never be rejected silently by one and accepted by the
 * other. Returns null when the value is fine — including when it is blank and
 * optional.
 */
function validateField(key: ProfileFieldKey, fields: ProfileFields): string | null {
  const raw = fields[key].trim();

  if (!raw) return REQUIRED_MESSAGES[key] ?? null;

  switch (key) {
    case 'displayName':
      if (raw.length < 2) return 'At least 2 characters';
      if (raw.length > NAME_MAX_LENGTH) return `At most ${NAME_MAX_LENGTH} characters`;
      return null;

    case 'gym':
      return raw.length > GYM_MAX_LENGTH ? `At most ${GYM_MAX_LENGTH} characters` : null;

    case 'location':
      return raw.length > LOCATION_MAX_LENGTH ? `At most ${LOCATION_MAX_LENGTH} characters` : null;

    case 'instagram': {
      // Judged on what will actually be stored: "instagram.com/maya" is valid
      // input for the handle "maya".
      const handle = normalizeInstagram(raw);
      if (!handle) return 'Letters, numbers, dots and underscores';
      if (handle.length > INSTAGRAM_MAX_LENGTH) return `At most ${INSTAGRAM_MAX_LENGTH} characters`;
      return null;
    }

    case 'birthYear': {
      const year = Number(raw);
      const latest = new Date().getFullYear() - MIN_AGE_YEARS;
      if (!/^\d{4}$/.test(raw) || year < MIN_BIRTH_YEAR || year > latest) {
        return `A year between ${MIN_BIRTH_YEAR} and ${latest}`;
      }
      return null;
    }

    case 'weight': {
      const kg = Number(raw);
      if (!Number.isFinite(kg) || kg < MIN_WEIGHT_KG || kg > MAX_WEIGHT_KG) {
        return `Between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg`;
      }
      return null;
    }

    case 'sex':
      return SEX_OPTIONS.some((option) => option.value === raw) ? null : 'Pick one';
  }
}

interface UseProfileFieldsResult {
  fields: ProfileFields;
  setField: (key: ProfileFieldKey, value: string) => void;
  /** Persist everything; call on blur, or straight after a choice is tapped. */
  commit: (key: ProfileFieldKey) => void;
  /** The row that most recently saved, for the confirmation flash. */
  savedKey: ProfileFieldKey | null;
  /** Only for rows the athlete has actually left — never on first paint. */
  errors: ProfileErrors;
  saving: boolean;
}

function toFields(user: User | null): ProfileFields {
  return {
    displayName: user?.displayName ?? '',
    gym: user?.gym ?? '',
    location: user?.location ?? '',
    instagram: user?.instagram ?? '',
    birthYear: user?.birthYear?.toString() ?? '',
    weight: user?.weight?.toString() ?? '',
    sex: user?.sex ?? '',
  };
}

export function useProfileFields(): UseProfileFieldsResult {
  const { user, updateUserProfile } = useAuth();
  const [fields, setFields] = useState<ProfileFields>(() => toFields(user));
  const [savedKey, setSavedKey] = useState<ProfileFieldKey | null>(null);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saving, setSaving] = useState(false);

  // Saves are debounced, so the handler that eventually runs was created some
  // keystrokes ago. It reads through this ref rather than its stale closure.
  const latest = useRef(fields);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(user != null);
  /** The row whose debounced save has not run yet, so unmount can still run it. */
  const pendingKey = useRef<ProfileFieldKey | null>(null);

  // On a cold load the user doc lands after first paint. Adopt it exactly once:
  // adopting again later would overwrite whatever is being typed.
  useEffect(() => {
    if (hydrated.current || !user) return;
    hydrated.current = true;
    const next = toFields(user);
    latest.current = next;
    setFields(next);
  }, [user]);

  // The debounced save runs some time after the blur that asked for it, so it
  // has to reach the current one rather than the closure it was scheduled with.
  const saveRef = useRef<((key: ProfileFieldKey) => Promise<void>) | null>(null);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    // Leaving a field by tapping Back blurs it and closes the screen in the
    // same breath. The pending write must still land — dropping the timer here
    // would silently throw away the edit the athlete just finished making.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      const key = pendingKey.current;
      if (key) void saveRef.current?.(key);
    }
  }, []);

  const setField = useCallback((key: ProfileFieldKey, value: string): void => {
    setFields((prev) => {
      const next = { ...prev, [key]: value };
      latest.current = next;
      return next;
    });
    // Nobody wants to be told their name is too short while they are still
    // typing it: the complaint is cleared on edit and only returns on blur.
    setErrors((prev) => {
      if (prev[key] === undefined) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const save = useCallback(async (key: ProfileFieldKey): Promise<void> => {
    pendingKey.current = null;
    const current = latest.current;
    const failure = validateField(key, current);

    // Say what is wrong with the row that was just left — and only that row, so
    // a fresh profile isn't scolded about fields nobody has reached yet. Judged
    // before the user-doc guard below: a value is wrong whether or not there is
    // anywhere to write it.
    setErrors((prev) => {
      if (prev[key] === (failure ?? undefined)) return prev;
      const next = { ...prev };
      if (failure) next[key] = failure;
      else delete next[key];
      return next;
    });

    // Without a user doc the fields are still empty defaults, and saving them
    // would wipe the community profile with blanks.
    if (!user) return;

    const instagram = normalizeInstagram(current.instagram);
    const valid = (field: ProfileFieldKey): boolean => validateField(field, current) === null;

    const update: UserProfileUpdate = {};

    // Sent even when blank: clearing your box or Instagram has to actually
    // take it off the feed.
    if (valid('gym')) update.gym = current.gym.trim();
    if (valid('location')) update.location = current.location.trim();
    if (valid('instagram')) update.instagram = instagram;

    // These, by contrast, are never blanked — an empty name or weight is a
    // half-finished edit, not an intent to erase. A blank one fails validation,
    // so the guard is the same one that writes the message.
    if (valid('displayName')) update.displayName = current.displayName.trim();
    if (valid('birthYear') && current.birthYear.trim()) {
      update.birthYear = parseInt(current.birthYear, 10);
    }
    if (valid('weight')) update.weight = parseFloat(current.weight);
    if (valid('sex')) update.sex = current.sex as Sex;

    // Show what was actually stored, however the handle was pasted in — but only
    // when it survived normalization. Rewriting a rejected handle would erase
    // what the athlete typed and take the error message down with it.
    if (valid('instagram') && instagram !== current.instagram) {
      setField('instagram', instagram);
    }

    setSaving(true);
    try {
      await updateUserProfile(update);
      // A row that was rejected did not save, so it must not flash as if it did.
      if (!failure) {
        setSavedKey(key);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setSavedKey(null), SAVED_FLASH_MS);
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
    } finally {
      setSaving(false);
    }
  }, [user, updateUserProfile, setField]);

  saveRef.current = save;

  const commit = useCallback((key: ProfileFieldKey): void => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pendingKey.current = key;
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void save(key);
    }, SAVE_DEBOUNCE_MS);
  }, [save]);

  return { fields, setField, commit, savedKey, errors, saving };
}
