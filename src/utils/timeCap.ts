// A time cap is PRESCRIPTION — the ceiling the coach wrote on the board. It is never the
// athlete's actual elapsed time (that is Workout.durationSeconds). Keeping the two apart is the
// entire point of this module: writing a result into a prescription field silently destroys the
// board's own number, and nothing downstream can tell it was lost.
//
// Boards write the cap in every order, with every separator and abbreviation:
//   "20 min cap"   "T.C - 34 MIN"   "TC: 16min"   "*42min TC"   "time cap 25 minutes"   "cap 12'"
// One parser owns all of them, so a poster label, the save path, and the logging wizard can
// never disagree about what the cap is. Before this module each of those five sites carried its
// own regex and they disagreed constantly — marker-first notation ("T.C - 34 MIN") parsed
// nowhere, so the cap simply vanished from the poster.
//
// A timed window (AMRAP/EMOM duration) is a DIFFERENT fact that merely behaves like a ceiling:
// "25 min AMRAP" is the workout's shape, not a cap the athlete raced against. It gets its own
// parser so a poster never labels an AMRAP's own length as "25 MIN CAP".

// `(?![a-z])` rather than `\b` so "cap" cannot match inside "capacity" and a trailing-dot
// abbreviation ("T.C.") still terminates cleanly.
const CAP_MARKER = String.raw`(?:t\.?\s*c\.?(?![a-z])|time\s*cap(?![a-z])|cap(?![a-z]))`;
// Separator between marker and number: ":", "-", "–", "—", ".", whitespace, or nothing at all.
const CAP_SEP = String.raw`[\s:.\-–—]*`;
const MIN_UNIT = String.raw`(?:min(?:ute)?s?(?![a-z])|m(?![a-z])|')`;

// "T.C - 34 MIN", "TC: 16min", "cap 12", "time cap 25 minutes"
const CAP_MARKER_FIRST = new RegExp(
  `\\b${CAP_MARKER}${CAP_SEP}(\\d+)(?::(\\d{2}))?\\s*(?:${MIN_UNIT})?`,
  'i',
);
// "20 min cap", "42min TC", "16 min T.C."
const CAP_MARKER_LAST = new RegExp(
  `\\b(\\d+)(?::(\\d{2}))?\\s*${MIN_UNIT}${CAP_SEP}${CAP_MARKER}`,
  'i',
);

// AMRAP/EMOM windows — the block's own length, not a cap.
const WINDOW_PATTERNS: RegExp[] = [
  /\b(\d+)(?::(\d{2}))?\s*min(?:ute)?s?\s*(?:amrap|e(?:\d+)?mom)\b/i,
  /\b(?:amrap|e(?:\d+)?mom)\s*(?:for\s+)?(\d+)(?::(\d{2}))?\s*min(?:ute)?s?\b/i,
  /\b(?:amrap|e(?:\d+)?mom)\s*(?:for\s+)?(\d+)(?::(\d{2}))?\b/i,
];

function toSeconds(minutes: string, seconds: string | undefined): number {
  return parseInt(minutes, 10) * 60 + (seconds ? parseInt(seconds, 10) : 0);
}

function firstMatch(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const total = toSeconds(match[1], match[2]);
      if (total > 0) return total;
    }
  }
  return undefined;
}

/**
 * Explicit time-cap notation only ("T.C - 34 MIN", "20 min cap"). Returns seconds.
 * Never matches an AMRAP/EMOM window — use {@link parseTimedWindowSeconds} for that.
 */
export function parseTimeCapSeconds(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  return firstMatch(text, [CAP_MARKER_FIRST, CAP_MARKER_LAST]);
}

/** AMRAP/EMOM window length in seconds ("25 min AMRAP", "EMOM 20"). */
export function parseTimedWindowSeconds(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  return firstMatch(text, WINDOW_PATTERNS);
}

/**
 * The prescribed ceiling for a block, whichever way the board expressed it. Explicit cap wins
 * over a timed window, because a board carrying both ("15 min AMRAP, TC 12 min") means the cap.
 */
export function parsePrescribedCeilingSeconds(text: string | null | undefined): number | undefined {
  return parseTimeCapSeconds(text) ?? parseTimedWindowSeconds(text);
}

/** Poster label for an explicit cap: 2040 → "34 MIN CAP". Sub-minute caps keep their seconds. */
export function formatTimeCapLabel(seconds: number | null | undefined): string | undefined {
  if (!seconds || seconds <= 0) return undefined;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs} SEC CAP`;
  if (secs === 0) return `${mins} MIN CAP`;
  return `${mins}:${secs.toString().padStart(2, '0')} CAP`;
}

/** Poster label parsed straight from board text, or undefined when no cap was written. */
export function timeCapLabelFromText(text: string | null | undefined): string | undefined {
  return formatTimeCapLabel(parseTimeCapSeconds(text));
}
