/**
 * A movement name in the plural, the way a coach would say a count of it: "Press" → "Presses",
 * "Sit-up" → "Sit-ups", "Dips" stays "Dips", and the shorthand (HSPU, T2B, DU…) never changes.
 * Only the last word moves. One rule for the poster's rep lines and the chat's questions.
 */
export function pluralizeMovementLabel(name: string): string {
  const cleaned = name.replace(/\s+/g, ' ').trim();
  if (!cleaned) return cleaned;
  if (/^(?:HSPU|T2B|TTB|C2B|DU|BOB|BOR|AKS)$/i.test(cleaned)) return cleaned;

  const lastWordMatch = cleaned.match(/([A-Za-z][A-Za-z-]*)$/);
  if (!lastWordMatch) return cleaned;

  const lastWord = lastWordMatch[1];
  if (/ss$/i.test(lastWord)) return cleaned.replace(/ss$/i, (match) => `${match}es`); // Press → Presses
  if (/s$/i.test(lastWord)) return cleaned; // already plural (Dips, Push Ups, Burpees)
  if (/[^aeiou]y$/i.test(lastWord)) return cleaned.replace(/y$/i, (match) => (match === 'Y' ? 'IES' : 'ies'));
  if (/(?:x|z|ch|sh)$/i.test(lastWord)) return cleaned.replace(new RegExp(`${lastWord}$`), `${lastWord}es`);
  return `${cleaned}s`;
}
