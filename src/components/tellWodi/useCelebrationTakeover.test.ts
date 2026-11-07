import { describe, expect, it } from 'vitest';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import type { ChatMessage } from './useTellWodiChat';
import { celebrationTarget } from './useCelebrationTakeover';

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
