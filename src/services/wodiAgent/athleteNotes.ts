import type { WodiNote } from '../../types';
import { toIsoDate } from '../../utils/workoutDate';

/**
 * The athlete's notes for Wodi — the things only they can say (an injury, a goal, the kit at home,
 * how they like to be talked to), as opposed to habits, which are read off the log
 * (athleteHabits.ts) and never stored.
 *
 * Every note was proposed by Wodi and CONFIRMED by the athlete; there is no path that writes one
 * without that tap. They live on the private user doc, listed under Me, where each can be deleted.
 */

const MAX_NOTES = 30;
const MAX_CHARS = 160;

/** The doc's field as stored — anything malformed is dropped rather than trusted. */
export function readWodiNotes(raw: unknown): WodiNote[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((n): n is WodiNote => (
    !!n && typeof n === 'object'
    && typeof (n as WodiNote).id === 'string'
    && typeof (n as WodiNote).text === 'string'
    && typeof (n as WodiNote).createdAt === 'string'
  ));
}

/** Newest first. The same note twice is kept once — the newer date wins. */
export function addNote(notes: readonly WodiNote[], text: string, now: Date = new Date()): WodiNote[] {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
  if (!clean) return [...notes];
  const note: WodiNote = { id: `n${now.getTime()}`, text: clean, createdAt: toIsoDate(now) };
  const rest = notes.filter((n) => n.text.toLowerCase() !== clean.toLowerCase());
  return [note, ...rest].slice(0, MAX_NOTES);
}

export function removeNote(notes: readonly WodiNote[], id: string): WodiNote[] {
  return notes.filter((n) => n.id !== id);
}

/** How the notes are handed to a prompt: dated, so the model can tell a fresh niggle from an old one. */
export function notesForPrompt(notes: readonly WodiNote[]): string {
  return notes.length
    ? notes.map((n) => `- ${n.text} (noted ${n.createdAt})`).join('\n')
    : '(nothing yet)';
}
