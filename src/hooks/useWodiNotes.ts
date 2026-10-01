import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { addNote, removeNote } from '../services/wodiAgent/athleteNotes';
import type { WodiNote } from '../types';

export interface WodiNotes {
  notes: WodiNote[];
  /** Only ever called from the athlete's own "Remember" tap. */
  remember: (text: string) => Promise<void>;
  forget: (id: string) => Promise<void>;
}

/** The athlete's confirmed notes for Wodi, on their private user doc. */
export function useWodiNotes(): WodiNotes {
  const { user, updateUserProfile } = useAuth();
  const notes = user?.wodiNotes ?? [];

  const remember = useCallback(
    (text: string) => updateUserProfile({ wodiNotes: addNote(user?.wodiNotes ?? [], text) }),
    [user?.wodiNotes, updateUserProfile],
  );
  const forget = useCallback(
    (id: string) => updateUserProfile({ wodiNotes: removeNote(user?.wodiNotes ?? [], id) }),
    [user?.wodiNotes, updateUserProfile],
  );

  return { notes, remember, forget };
}
