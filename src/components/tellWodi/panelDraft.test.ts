import { describe, expect, it } from 'vitest';
import { EMPTY_ANSWER, type ChatPanel, type ChatPanelGroup } from './chatQuestions';
import { initialDraft, replyOf, withChip, withField, withNoLoad, withoutGroup, withPick } from './panelDraft';

// The dock changed how a card's numbers are entered — never what the card sends. These pin the
// answers the pad's steps make, through the same panelAnswer the old boxes used.

const count = (id: string, title: string, unit: string, extra: Partial<ChatPanelGroup> = {}): ChatPanelGroup => ({
  title, control: 'boxes', joiner: '@', prefix: '', start: {}, quick: [],
  fields: [{ slotId: id, field: 'count', label: unit, unit }],
  ...extra,
});

const stations: ChatPanel = {
  title: 'Every 1:15 × 24 min',
  groups: [
    count('bike', 'Echo Bike', 'cal'),
    count('tuck', 'Tuck-up', 'reps'),
    count('du', 'Double Under', 'reps', { choice: { slotId: 'du-choice', options: ['Double Under', 'Single Under'], labels: ['Double Under', 'Single Under'] } }),
  ],
};

const bench: ChatPanel = {
  title: 'Bench Press',
  groups: [{
    title: 'Weight', control: 'weight', joiner: '→', prefix: '', start: {}, quick: [],
    fields: [
      { slotId: 'bench', field: 'weight', label: 'start', unit: 'kg' },
      { slotId: 'bench', field: 'weightEnd', label: 'peak', unit: 'kg' },
    ],
  }],
};

describe('the dock sends what the card always sent', () => {
  it('a station board: each count, the side picked on the either/or, a skipped one said as —', () => {
    let s = initialDraft(stations);
    s = withField(s, stations.groups[0], 'count', 12);
    s = withPick(s, stations.groups[2], 'Single Under');
    s = withField(s, stations.groups[2], 'count', 40);
    const reply = replyOf(stations, s);
    expect(reply.label).toBe('Echo Bike 12 cal · Tuck-up — · Single Under 40 reps');
    expect(reply.answers).toEqual([
      { id: 'bike', ...EMPTY_ANSWER, count: 12 },
      { id: 'tuck', ...EMPTY_ANSWER, skipped: true },
      { id: 'du-choice', ...EMPTY_ANSWER, choice: 'Single Under' },
      { id: 'du', ...EMPTY_ANSWER, count: 40 },
    ]);
  });

  it('a start on an empty lift suggests the peak; a peak set by hand stays put', () => {
    let s = initialDraft(bench);
    s = withField(s, bench.groups[0], 'weight', 60);
    expect(s.values['bench:weightEnd']).toBeGreaterThan(60);
    s = withField(s, bench.groups[0], 'weightEnd', 60);
    s = withField(s, bench.groups[0], 'weight', 50);
    expect(s.values['bench:weightEnd']).toBe(60);
    expect(replyOf(bench, s).answers[0]).toMatchObject({ weight: 50, weightEnd: 60 });
  });

  it('"Hit the cap" fills the clock as minutes and seconds', () => {
    const clock: ChatPanelGroup = {
      title: 'Time', control: 'clock', joiner: ':', prefix: '', start: {}, quick: [],
      fields: [
        { slotId: 't', field: 'minutes', label: 'min', unit: 'min' },
        { slotId: 't', field: 'seconds', label: 'sec', unit: 'sec' },
      ],
    };
    const panel: ChatPanel = { title: 'Fran', groups: [clock] };
    const s = withChip(initialDraft(panel), clock, { label: 'Hit the cap · 20:30', answers: [{ id: 't', ...EMPTY_ANSWER, seconds: 1230 }] });
    expect(replyOf(panel, s)).toEqual({ label: '20:30', answers: [{ id: 't', ...EMPTY_ANSWER, seconds: 1230 }] });
  });

  it('"No weight" empties the load; a number given after it is a load again; Skip clears both', () => {
    const band: ChatPanel = { title: 'Pull-up', groups: [{ ...bench.groups[0], noLoad: { start: false } }] };
    const group = band.groups[0];
    let s = withNoLoad(withField(initialDraft(band), group, 'weight', 10), group);
    expect(replyOf(band, s).answers[0]).toMatchObject({ noLoad: true, weight: null });
    s = withField(s, group, 'weight', 5);
    expect(s.unloaded.size).toBe(0);
    s = withoutGroup(s, group);
    expect(replyOf(band, s)).toEqual({ label: 'Skip', answers: [{ id: 'bench', ...EMPTY_ANSWER, skipped: true }] });
  });
});
