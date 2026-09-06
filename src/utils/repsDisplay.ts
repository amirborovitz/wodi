// What "repsDisplay" is allowed to say.
//
// The field carries the coach's own rep notation, kept verbatim because `reps` is a single number
// and the board is often richer than that: a range whose midpoint `reps` holds ("10-12"), a
// per-side pair ("6/6"), an alternating note ("10 (alt')"). The poster mirrors original notation,
// so this text is deliberately broad and mostly wants trusting.
//
// It owns exactly one thing it must NOT say: the board's either/or offer. "4 Bar Muscle-up / 8
// Chest to Bar Pull-up" is a CHOICE of movements, and the parse already models it properly in
// `alternative`. Since the parse became a strict structured output the model answers every field
// on every movement, and it began echoing that line here too — so the same fact arrived twice,
// and the poster printed the copy as the movement's count: "4 / 8 Bar Muscle-ups", a rep range no
// coach wrote, with the alternative's name dropped.
//
// Hence one narrow rule, applied at the parse boundary so nothing new is stored and again on read
// so docs already holding the duplicate render correctly: when a movement HAS an alternative, the
// slash in this field is that alternative talking, and the alternative says it better.

interface RepsDisplaySource {
  repsDisplay?: string | null;
  alternative?: { name: string } | null;
}

/** The coach's rep notation for this movement, minus the either/or echo `alternative` already owns. */
export function readRepsDisplay(movement: RepsDisplaySource): string | undefined {
  const text = typeof movement.repsDisplay === 'string' ? movement.repsDisplay.trim() : '';
  if (!text) return undefined;
  if (movement.alternative?.name && text.includes('/')) return undefined;
  return text;
}
