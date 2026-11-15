import { describe, expect, it } from 'vitest';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import type { ChatMessage } from './useTellWodiChat';
import { celebrationTarget, fullPosterMessageId } from './useCelebrationTakeover';

const workout = (id: string): WorkoutWithStats => ({ id } as WorkoutWithStats);
const cheer = (posterId: string, earned: boolean): ChatMessage => ({
  id: `m-${posterId}`,
  from: 'wodi',
  text: 'Cheer',
  at: 0,
  headline: { text: 'Cheer', highlight: null, link: null, posterId },
  ...(earned ? { earned: { ep: 100, pr: false } } : {}),
});
const byPoster = (m: ChatMessage): WorkoutWithStats | undefined => (m.headline?.posterId ? workout(m.headline.posterId) : undefined);

describe('celebrationTarget — when the poster takes the screen', () => {
  it('a workout just logged in this chat takes the screen', () => {
    expect(celebrationTarget([cheer('w1', true)], byPoster, new Set())?.id).toBe('w1');
  });

  it('once: after it has been shown, never again', () => {
    expect(celebrationTarget([cheer('w1', true)], byPoster, new Set(['w1']))).toBeUndefined();
  });

  it('a cheer from a reopened chat or the thread (no fresh log) never takes over', () => {
    expect(celebrationTarget([cheer('w1', false)], byPoster, new Set())).toBeUndefined();
  });

  it('a log whose workout has not reached the log yet waits — nothing opens blank', () => {
    expect(celebrationTarget([cheer('w1', true)], () => undefined, new Set())).toBeUndefined();
  });

  it('the newest log is the one celebrated', () => {
    expect(celebrationTarget([cheer('w1', true), cheer('w2', true)], byPoster, new Set(['w1']))?.id).toBe('w2');
  });
});

const said = (id: string): ChatMessage => ({ id, from: 'me', text: 'How did my squat go?', at: 0 });
const answer = (id: string): ChatMessage => ({ id, from: 'wodi', text: 'Up 5 kg.', at: 0 });

describe('fullPosterMessageId — which poster in the chat is drawn full size', () => {
  it('a workout just logged here is drawn full size', () => {
    expect(fullPosterMessageId([cheer('w1', true)])).toBe('m-w1');
  });

  it('opening the chat on a cheer for an earlier workout: no full poster (it shows as a small card)', () => {
    expect(fullPosterMessageId([cheer('w1', false)])).toBeNull();
  });

  it('once the athlete says something after it, the just-logged poster steps back to a small card', () => {
    expect(fullPosterMessageId([cheer('w1', true), said('s1'), answer('a1')])).toBeNull();
  });

  it("Wodi's own follow-ups don't shrink it — only the athlete moving on does", () => {
    expect(fullPosterMessageId([cheer('w1', true), answer('a1')])).toBe('m-w1');
  });

  it('only the newest log is full size', () => {
    expect(fullPosterMessageId([cheer('w1', true), said('s1'), cheer('w2', true)])).toBe('m-w2');
  });
});
