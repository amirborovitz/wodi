import { describe, it, expect } from 'vitest';
import { avatarUrl, toPublicProfile } from './types';
import type { User } from '../../types';

/**
 * toPublicProfile is the one place a private User becomes something every other
 * athlete can read, so these tests are about what must NOT cross as much as what
 * must. A field added to User in a year's time fails the first test here rather
 * than appearing in the feed.
 */

const user: User = {
  id: 'uid-1',
  email: 'athlete@example.com',
  displayName: 'Amir Borovitz',
  createdAt: new Date('2026-01-01'),
  stats: { totalWorkouts: 210, currentStreak: 6, longestStreak: 31, totalVolume: 480000 },
  birthYear: 1988,
  weight: 82,
  sex: 'male',
  onboardingComplete: true,
  gym: 'CrossFit Ironclad',
  location: 'Tel Aviv, Israel',
  instagram: 'amir.wod',
  photoUrl: 'https://storage.example/avatar.jpg',
  photoUpdatedAt: 1_700_000_000,
};

describe('toPublicProfile', () => {
  it('publishes exactly the identity fields and no others', () => {
    expect(toPublicProfile(user)).toEqual({
      id: 'uid-1',
      name: 'Amir Borovitz',
      gym: 'CrossFit Ironclad',
      location: 'Tel Aviv, Israel',
      instagram: 'amir.wod',
      photoUrl: 'https://storage.example/avatar.jpg',
      photoUpdatedAt: 1_700_000_000,
    });
  });

  it('never carries email, body metrics or stats across', () => {
    const published = Object.keys(toPublicProfile(user));
    for (const priv of ['email', 'weight', 'sex', 'birthYear', 'stats', 'onboardingComplete']) {
      expect(published).not.toContain(priv);
    }
  });

  it('drops a field the athlete cleared instead of publishing an empty string', () => {
    // The profile form writes "" to mean "stop sharing this", and the public doc
    // is written as a full overwrite — so an absent key is what unpublishes it.
    const profile = toPublicProfile({ ...user, gym: '   ', location: '', instagram: '' });
    expect(profile.gym).toBeUndefined();
    expect(profile.location).toBeUndefined();
    expect(profile.instagram).toBeUndefined();
  });

  it('keeps a name that is only whitespace-separated intact', () => {
    expect(toPublicProfile({ ...user, displayName: 'Bo Jackson' }).name).toBe('Bo Jackson');
  });
});

describe('avatarUrl', () => {
  it('stamps the version so a replaced photo is not served from cache', () => {
    expect(avatarUrl(toPublicProfile(user))).toBe('https://storage.example/avatar.jpg?v=1700000000');
  });

  it('stamps 0 rather than "undefined" when the upload predates the timestamp', () => {
    expect(avatarUrl(toPublicProfile({ ...user, photoUpdatedAt: undefined })))
      .toBe('https://storage.example/avatar.jpg?v=0');
  });

  it('is undefined without a photo, which is what selects the initials tile', () => {
    expect(avatarUrl(toPublicProfile({ ...user, photoUrl: undefined }))).toBeUndefined();
    expect(avatarUrl(undefined)).toBeUndefined();
  });
});
