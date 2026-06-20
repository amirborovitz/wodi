import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from 'react';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  type User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, googleProvider, appleProvider, db, storage } from '../services/firebase';
import { removeUndefined } from '../utils/firestoreUtils';
import type { User, UserStats, UserGoals } from '../types';

interface UserProfileUpdate {
  displayName?: string;
  age?: number;
  weight?: number;
  sex?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  onboardingComplete?: boolean;
}

interface AuthContextValue {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  updateUserGoals: (goals: UserGoals) => Promise<void>;
  updateUserPhoto: (file: File) => Promise<string>;
  updateUserProfile: (profile: UserProfileUpdate) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_STATS: UserStats = {
  totalWorkouts: 0,
  currentStreak: 0,
  longestStreak: 0,
  totalVolume: 0,
};

const USER_CACHE_KEY = 'wodboard_user_cache';

function buildNewUserFromFirebase(fbUser: FirebaseUser): Omit<User, 'id'> {
  return {
    email: fbUser.email || '',
    displayName: fbUser.displayName || 'Athlete',
    photoUrl: fbUser.photoURL || undefined,
    photoUpdatedAt: undefined,
    createdAt: new Date(),
    stats: DEFAULT_STATS,
  };
}

// Retries transient Firestore failures (e.g. a freshly-issued auth token not yet
// propagated for the very first request right after sign-in).
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 600): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

function getCachedUser(): User | null {
  try {
    const cached = localStorage.getItem(USER_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      parsed.createdAt = new Date(parsed.createdAt);
      return parsed;
    }
  } catch {
    // Ignore cache errors
  }
  return null;
}

function setCachedUser(user: User | null) {
  try {
    if (user) {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_CACHE_KEY);
    }
  } catch {
    // Ignore cache errors
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const cachedUser = getCachedUser();
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(cachedUser);
  // If we have cached user, don't show loading - render immediately
  const [loading, setLoading] = useState(!cachedUser);


  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        // Check cache first for instant load
        const cached = getCachedUser();
        if (cached && cached.id === fbUser.uid) {
          setUser(cached);
          setLoading(false);
          // Refresh from Firestore in background
          refreshUserData(fbUser);
        } else {
          // No cache, fetch from Firestore
          await fetchAndSetUser(fbUser);
          setLoading(false);
        }
      } else {
        // Firebase says no user - clear cache and show login
        setUser(null);
        setCachedUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Single source of truth for turning a Firestore user doc (or its absence) into a `User`.
  // Used by both the cold-start fetch and the background cache refresh so the two paths
  // can't drift apart again — a doc missing entirely or missing individual fields (e.g.
  // a partial doc created by a stats-increment write before account creation ever landed)
  // is backfilled the same way regardless of which caller hit it.
  const loadOrCreateUserDoc = async (fbUser: FirebaseUser): Promise<User> => {
    const userRef = doc(db, 'users', fbUser.uid);
    const userSnap = await withRetry(() => getDoc(userRef));

    if (!userSnap.exists()) {
      const newUser = buildNewUserFromFirebase(fbUser);
      await withRetry(() => setDoc(userRef, removeUndefined({ ...newUser, createdAt: serverTimestamp() })));
      return { id: fbUser.uid, ...newUser };
    }

    const data = userSnap.data();
    const cached = getCachedUser();
    const cachedPhotoNewer = cached?.photoUpdatedAt && (!data.photoUpdatedAt || cached.photoUpdatedAt > data.photoUpdatedAt);

    // TEMP MIGRATION (2026-06-19): heals users/{uid} docs left partial by the
    // now-fixed `photoUpdatedAt: undefined` setDoc bug (see firestoreUtils.ts).
    // That bug is fixed, so no new doc should ever need this. Safe to delete this
    // block once the one known affected user reopens the app and their doc shows
    // email/displayName/createdAt in the Firebase Console.
    const backfill: Record<string, unknown> = {};
    if (!data.email && fbUser.email) backfill.email = fbUser.email;
    if (!data.displayName && fbUser.displayName) backfill.displayName = fbUser.displayName;
    if (!data.createdAt) backfill.createdAt = serverTimestamp();
    if (Object.keys(backfill).length > 0) {
      setDoc(userRef, backfill, { merge: true }).catch(() => {});
    }

    return {
      id: fbUser.uid,
      email: data.email || fbUser.email || '',
      displayName: data.displayName || fbUser.displayName || 'Athlete',
      photoUrl: (cachedPhotoNewer ? cached?.photoUrl : data.photoUrl) || fbUser.photoURL || undefined,
      photoUpdatedAt: cachedPhotoNewer ? cached?.photoUpdatedAt : data.photoUpdatedAt || undefined,
      createdAt: data.createdAt?.toDate() || new Date('2026-01-01'),
      stats: { ...DEFAULT_STATS, ...data.stats },
      goals: data.goals,
      birthYear: data.birthYear ?? data.age,
      weight: data.weight,
      sex: data.sex,
      onboardingComplete: data.onboardingComplete,
    };
  };

  const fetchAndSetUser = async (fbUser: FirebaseUser) => {
    try {
      const userData = await loadOrCreateUserDoc(fbUser);
      setUser(userData);
      setCachedUser(userData);

      // Stamp last-active (fire-and-forget)
      const userRef = doc(db, 'users', fbUser.uid);
      setDoc(userRef, { _last_active: serverTimestamp() }, { merge: true }).catch(() => {});
    } catch (error) {
      console.error('Error fetching user data:', error);
      // Still set basic user info even if Firestore fails
      const fallbackUser: User = {
        id: fbUser.uid,
        email: fbUser.email || '',
        displayName: fbUser.displayName || 'Athlete',
        photoUrl: fbUser.photoURL || undefined,
        photoUpdatedAt: undefined,
        createdAt: new Date(),
        stats: DEFAULT_STATS,
      };
      setUser(fallbackUser);
      setCachedUser(fallbackUser);
    }
  };

  const refreshUserData = async (fbUser: FirebaseUser) => {
    try {
      const userData = await loadOrCreateUserDoc(fbUser);
      setUser(userData);
      setCachedUser(userData);

      // Stamp last-active (fire-and-forget)
      const userRef = doc(db, 'users', fbUser.uid);
      setDoc(userRef, { _last_active: serverTimestamp() }, { merge: true }).catch(() => {});
    } catch (error) {
      console.error('Error refreshing user data:', error);
    }
  };

  const updateUserGoals = async (goals: UserGoals) => {
    if (!user || !firebaseUser) {
      throw new Error('No user logged in');
    }

    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      await setDoc(userRef, { goals }, { merge: true });

      const updatedUser = { ...user, goals };
      setUser(updatedUser);
      setCachedUser(updatedUser);
    } catch (error) {
      console.error('Error updating user goals:', error);
      throw error;
    }
  };

  const updateUserPhoto = async (file: File) => {
    if (!user || !firebaseUser) {
      throw new Error('No user logged in');
    }

    try {
      const extension = file.type.includes('png') ? 'png' : 'jpg';
      const storageRef = ref(storage, `users/${firebaseUser.uid}/avatar-${Date.now()}.${extension}`);
      await uploadBytes(storageRef, file);
      const photoUrl = await getDownloadURL(storageRef);
      const photoUpdatedAt = Date.now();

      const updatedUser = { ...user, photoUrl, photoUpdatedAt };
      setUser(updatedUser);
      setCachedUser(updatedUser);

      const userRef = doc(db, 'users', firebaseUser.uid);
      await setDoc(userRef, { photoUrl, photoUpdatedAt }, { merge: true });

      try {
        await updateProfile(firebaseUser, { photoURL: photoUrl });
      } catch (error) {
        console.warn('Unable to update auth profile photo', error);
      }

      return photoUrl;
    } catch (error) {
      console.error('Error updating user photo:', error);
      throw error;
    }
  };

  const updateUserProfile = async (profile: UserProfileUpdate) => {
    if (!user || !firebaseUser) {
      throw new Error('No user logged in');
    }

    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      await setDoc(userRef, removeUndefined(profile), { merge: true });

      const updatedUser = { ...user, ...profile };
      setUser(updatedUser);
      setCachedUser(updatedUser);
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  };

  const completeOnboarding = async () => {
    await updateUserProfile({ onboardingComplete: true });
  };

  const refreshUser = async () => {
    if (firebaseUser) {
      await fetchAndSetUser(firebaseUser);
    }
  };

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const signInWithApple = async () => {
    try {
      await signInWithPopup(auth, appleProvider);
    } catch (error) {
      console.error('Error signing in with Apple:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      setCachedUser(null);
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      firebaseUser,
      loading,
      signInWithGoogle,
      signInWithApple,
      signOut,
      updateUserGoals,
      updateUserPhoto,
      updateUserProfile,
      completeOnboarding,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
