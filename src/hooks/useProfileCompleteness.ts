import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { hasProfileDetails } from './useProfileFields';

/**
 * The "add your details" nudge, derived — never stored.
 *
 * There is no dismissed flag, no Firestore field and no localStorage behind
 * this: it reads the user doc, so it disappears the moment a detail saves and
 * can never get stuck on for someone who already filled one in.
 *
 * It asks for engagement, not completion. One filled field is enough to turn it
 * off — an athlete who has been to the profile screen does not need to be told
 * about it again, and a nudge that keeps score of what is still blank is a nag.
 * That is also why there is no percentage: a completion number invites people to
 * fill fields for the number.
 */

const DETAILS_PROMPT = 'Add your details';

export interface ProfileCompleteness {
  /** True once the athlete has filled in anything beyond their name. */
  isComplete: boolean;
  /** The nudge copy, or null when there is nothing to nudge about. */
  prompt: string | null;
}

export function useProfileCompleteness(): ProfileCompleteness {
  const { user } = useAuth();

  return useMemo<ProfileCompleteness>(() => {
    const isComplete = hasProfileDetails(user);
    return { isComplete, prompt: isComplete ? null : DETAILS_PROMPT };
  }, [user]);
}
