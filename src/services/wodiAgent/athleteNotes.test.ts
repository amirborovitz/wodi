import { describe, expect, it } from 'vitest';
import { addNote, notesForPrompt, readWodiNotes, removeNote } from './athleteNotes';

const NOW = new Date(2026, 8, 30, 10);

describe('athlete notes', () => {
  it('adds newest first, dated, and keeps the same note once', () => {
    const one = addNote([], '  Left shoulder sore —  avoiding overhead ', new Date(2026, 8, 1));
    const two = addNote(one, 'left shoulder sore — avoiding overhead', NOW);
    expect(two).toHaveLength(1);
    expect(two[0]).toMatchObject({ text: 'left shoulder sore — avoiding overhead', createdAt: '2026-09-30' });
  });

  it('an empty note is not a note', () => {
    expect(addNote([], '   ', NOW)).toEqual([]);
  });

  it('forgets by id', () => {
    const notes = addNote(addNote([], 'Hyrox in March', new Date(2026, 8, 1)), '16kg KB at home', NOW);
    expect(removeNote(notes, notes[0].id).map((n) => n.text)).toEqual(['Hyrox in March']);
  });

  it('drops anything malformed on the doc rather than trusting it', () => {
    expect(readWodiNotes([{ id: 'a', text: 'ok', createdAt: '2026-09-01' }, { id: 1 }, null, 'x'])).toHaveLength(1);
    expect(readWodiNotes(undefined)).toEqual([]);
  });

  it('hands the prompt dated lines, or says there are none', () => {
    expect(notesForPrompt([])).toBe('(nothing yet)');
    expect(notesForPrompt([{ id: 'a', text: 'Hyrox in March', createdAt: '2026-09-01' }])).toBe('- Hyrox in March (noted 2026-09-01)');
  });
});
