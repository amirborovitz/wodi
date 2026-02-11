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
import { auth, googleProvider, db, storage } from '../services/firebase';
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

  const fetchAndSetUser = async (fbUser: FirebaseUser) => {
    try {
      const userRef = doc(db, 'users', fbUser.uid);
      const userSnap = await getDoc(userRef);

      let userData: User;
      if (userSnap.exists()) {
        const data = userSnap.data();
        const cached = getCachedUser();
        const cachedPhotoNewer = cached?.photoUpdatedAt && (!data.photoUpdatedAt || cached.photoUpdatedAt > data.photoUpdatedAt);
        userData = {
          id: fbUser.uid,
          email: fbUser.email || '',
          displayName: data.displayName || fbUser.displayName || 'Athlete',
          photoUrl: (cachedPhotoNewer ? cached?.photoUrl : data.photoUrl) || fbUser.photoURL || undefined,
          photoUpdatedAt: cachedPhotoNewer ? cached?.photoUpdatedAt : data.photoUpdatedAt || undefined,
          createdAt: data.createdAt?.toDate() || new Date(),
          stats: data.stats || DEFAULT_STATS,
          goals: data.goals,
          age: data.age,
          weight: data.weight,
          sex: data.sex,
          onboardingComplete: data.onboardingComplete,
        };
      } else {
        // Create new user document
        const newUser: Omit<User, 'id'> = {
          email: fbUser.email || '',
          displayName: fbUser.displayName || 'Athlete',
          photoUrl: fbUser.photoURL || undefined,
          photoUpdatedAt: undefined,
          createdAt: new Date(),
          stats: DEFAULT_STATS,
        };

        await setDoc(userRef, {
          ...newUser,
          createdAt: serverTimestamp(),
        });

        userData = { id: fbUser.uid, ...newUser };
      }

      setUser(userData);
      setCachedUser(userData);
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
      const userRef = doc(db, 'users', fbUser.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const data = userSnap.data();
        const cached = getCachedUser();
        const cachedPhotoNewer = cached?.photoUpdatedAt && (!data.photoUpdatedAt || cached.photoUpdatedAt > data.photoUpdatedAt);
        const userData: User = {
          id: fbUser.uid,
          email: fbUser.email || '',
          displayName: data.displayName || fbUser.displayName || 'Athlete',
          photoUrl: (cachedPhotoNewer ? cached?.photoUrl : data.photoUrl) || fbUser.photoURL || undefined,
          photoUpdatedAt: cachedPhotoNewer ? cached?.photoUpdatedAt : data.photoUpdatedAt || undefined,
          createdAt: data.createdAt?.toDate() || new Date(),
          stats: data.stats || DEFAULT_STATS,
          goals: data.goals,
          age: data.age,
          weight: data.weight,
          sex: data.sex,
          onboardingComplete: data.onboardingComplete,
        };
        setUser(userData);
        setCachedUser(userData);
      }
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
      await setDoc(userRef, profile, { merge: true });

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
