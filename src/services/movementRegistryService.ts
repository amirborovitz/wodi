import {
  collection,
  doc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { removeUndefined } from '../utils/firestoreUtils';
import {
  MOVEMENT_FAMILIES,
  normalizeMovementKey,
  setMovementRegistry,
  type MovementFamilyId,
  type MovementImplement,
  type MovementRegistryEntry,
  type ResolvedMovement,
} from '../data/movementRegistry';

const REGISTRY_COLLECTION = 'movementRegistry';
const FLAGS_COLLECTION = 'movementFlags';

const VALID_FAMILIES = new Set<string>(Object.keys(MOVEMENT_FAMILIES));
const VALID_IMPLEMENTS = new Set<string>([
  'barbell', 'kettlebell', 'dumbbell', 'machine', 'bodyweight',
]);

/**
 * Families are a CLOSED set defined in code. A Firestore row naming a family the
 * app doesn't know is dropped rather than trusted — otherwise a typo in the
 * console silently creates a phantom recap row that no code path can render.
 */
function parseEntry(raw: Record<string, unknown>): MovementRegistryEntry | null {
  const canonicalName = typeof raw.canonicalName === 'string' ? raw.canonicalName.trim() : '';
  const family = typeof raw.family === 'string' ? raw.family : '';
  if (!canonicalName || !VALID_FAMILIES.has(family)) return null;

  const implement = typeof raw.implement === 'string' && VALID_IMPLEMENTS.has(raw.implement)
    ? (raw.implement as MovementImplement)
    : undefined;
  const aliases = Array.isArray(raw.aliases)
    ? raw.aliases.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    : undefined;

  return {
    canonicalName,
    family: family as MovementFamilyId,
    implement,
    variant: typeof raw.variant === 'string' && raw.variant.trim() ? raw.variant.trim() : undefined,
    aliases: aliases && aliases.length > 0 ? aliases : undefined,
    exactOnly: raw.exactOnly === true ? true : undefined,
  };
}

let loaded = false;

/**
 * Pull the registry from Firestore and swap it in. Safe to call more than once;
 * only the first call does work.
 *
 * Any failure — offline, rules, empty collection — leaves the bundled seed in
 * place. A stale registry degrades a recap row's label; a thrown error would
 * take out the whole recap.
 */
export async function loadMovementRegistry(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const snapshot = await getDocs(collection(db, REGISTRY_COLLECTION));
    const entries = snapshot.docs
      .map(d => parseEntry(d.data() as Record<string, unknown>))
      .filter((e): e is MovementRegistryEntry => e !== null);

    if (entries.length > 0) setMovementRegistry(entries);
  } catch (error) {
    console.warn('[movementRegistry] falling back to bundled seed', error);
  }
}

/**
 * Record a movement the registry couldn't place, so it can be triaged into the
 * registry later.
 *
 * Keyed by normalized name and counted, not appended: an append-only log of every
 * occurrence is a firehose, and what triage needs is "which unknown movements
 * matter most", which is a ranked list.
 *
 * `phrase` matches are flagged too — they resolved, but only by fuzzy fallback,
 * so they're the candidates for being promoted into a real alias.
 */
export async function flagMovement(
  rawName: string,
  resolved: ResolvedMovement,
  context: { userId: string; workoutId?: string; reps?: number },
): Promise<void> {
  if (resolved.match === 'exact') return;

  const key = normalizeMovementKey(rawName);
  if (!key) return;

  try {
    await setDoc(
      doc(db, FLAGS_COLLECTION, key),
      removeUndefined({
        normalizedName: key,
        reason: resolved.match === 'unknown' ? 'unknown' : 'fuzzy',
        // What the fuzzy path guessed, so triage starts from a proposal.
        resolvedFamily: resolved.familyId ?? null,
        resolvedCanonical: resolved.canonicalName,
        lastDisplayName: rawName,
        lastUserId: context.userId,
        lastWorkoutId: context.workoutId,
        occurrences: increment(1),
        totalReps: increment(context.reps ?? 0),
        // Neither `firstSeen` nor `status` is written here: a merge write can't
        // set-if-absent, so both would be reset on every flag — re-opening an
        // item someone already triaged to 'ignored'. Triage owns `status`;
        // a missing status means untriaged.
        lastSeen: serverTimestamp(),
      }),
      { merge: true },
    );
  } catch (error) {
    // Telemetry must never break a recap.
    console.warn('[movementRegistry] could not flag movement', rawName, error);
  }
}
