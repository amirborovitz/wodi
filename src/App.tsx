import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { doc, setDoc } from 'firebase/firestore';
import { db } from './services/firebase';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './screens/LoginScreen';
import { HomeScreen } from './screens/HomeScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { AddWorkoutScreen } from './screens/AddWorkoutScreen';
import { WorkoutScreen } from './screens/WorkoutScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { PRScreen } from './screens/PRScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ProfileSettingsScreen, GoalsSettingsScreen } from './components/settings';
import { BottomNav } from './components/ui';
import { DEFAULT_USER_GOALS } from './types';
import type { Screen } from './types';
import type { WorkoutWithStats } from './hooks/useWorkouts';
import './styles/variables.css';

// Screens that show the bottom nav
const MAIN_SCREENS: Screen[] = ['home', 'history', 'profile', 'stats', 'settings'];

function AppContent() {
  const { user, loading, refreshUser, updateUserProfile, updateUserGoals, signOut } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [homeRingsKey, setHomeRingsKey] = useState(0);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutWithStats | null>(null);
  const [editingWorkout, setEditingWorkout] = useState<WorkoutWithStats | null>(null);
  // Note: prWorkoutId can be used in the future to navigate directly to a workout from PRScreen
  const [_prWorkoutId, setPrWorkoutId] = useState<string | null>(null);

  const handleImageSelected = (file: File) => {
    setPendingImage(file);
    setEditingWorkout(null); // Clear any editing state
    setCurrentScreen('add-workout');
  };

  const handleEditWorkout = (workout: WorkoutWithStats) => {
    setEditingWorkout(workout);
    setPendingImage(null); // Clear any pending image
    setCurrentScreen('add-workout');
  };

  // Loading state
  if (loading) {
    return (
      <div className="loading-screen">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="loading-content"
        >
        </motion.div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return <LoginScreen />;
  }

  // Check if user needs onboarding (new users only)
  // Existing users without onboardingComplete field are treated as complete
  const isNewUser = user.createdAt && (Date.now() - user.createdAt.getTime() < 60000); // Created within last minute
  const needsOnboarding = isNewUser && !user.onboardingComplete;

  if (needsOnboarding) {
    return (
      <OnboardingScreen
        onComplete={() => {
          refreshUser();
        }}
      />
    );
  }

  // Check if we should show bottom nav
  const showBottomNav = MAIN_SCREENS.includes(currentScreen);

  // Render current screen
  const renderScreen = () => {
    switch (currentScreen) {
      case 'add-workout':
        return (
          <AddWorkoutScreen
            onBack={() => {
              setPendingImage(null);
              setEditingWorkout(null);
              setCurrentScreen(editingWorkout ? 'workout-detail' : 'home');
            }}
            onWorkoutCreated={() => {
              setPendingImage(null);
              setEditingWorkout(null);
              setHomeRingsKey((prev) => prev + 1);
              setCurrentScreen('home');
            }}
            initialImage={pendingImage}
            editWorkout={editingWorkout}
          />
        );
      case 'workout-detail':
        return selectedWorkout ? (
          <WorkoutScreen
            mode="detail"
            workout={selectedWorkout}
            onBack={() => setCurrentScreen('history')}
            onEditWorkout={() => handleEditWorkout(selectedWorkout)}
            onRenameWorkoutDetail={async (newTitle: string) => {
              if (!selectedWorkout?.id) return;
              try {
                const workoutRef = doc(db, 'workouts', selectedWorkout.id);
                await setDoc(workoutRef, { title: newTitle }, { merge: true });
                setSelectedWorkout({ ...selectedWorkout, title: newTitle });
              } catch (err) {
                console.error('Failed to rename workout:', err);
              }
            }}
          />
        ) : (
          <HistoryScreen
            onSelectWorkout={(workout) => {
              setSelectedWorkout(workout);
              setCurrentScreen('workout-detail');
            }}
          />
        );
      case 'history':
        return (
          <HistoryScreen
            onSelectWorkout={(workout) => {
              setSelectedWorkout(workout);
              setCurrentScreen('workout-detail');
            }}
          />
        );
      case 'profile':
        return (
          <ProfileScreen
            onNavigateToPR={() => setCurrentScreen('pr')}
            onNavigateToSettings={() => setCurrentScreen('settings')}
          />
        );
      case 'settings':
        return (
          <SettingsScreen
            onBack={() => setCurrentScreen('profile')}
            onNavigateToProfile={() => setCurrentScreen('profile-settings')}
            onNavigateToGoals={() => setCurrentScreen('goals-settings')}
            onSignOut={signOut}
            user={user}
          />
        );
      case 'profile-settings':
        return (
          <ProfileSettingsScreen
            onBack={() => setCurrentScreen('settings')}
            user={user}
            onSave={updateUserProfile}
          />
        );
      case 'goals-settings':
        return (
          <GoalsSettingsScreen
            onBack={() => setCurrentScreen('settings')}
            goals={user?.goals || DEFAULT_USER_GOALS}
            onSave={updateUserGoals}
          />
        );
      case 'pr':
        return (
          <PRScreen
            onBack={() => setCurrentScreen('profile')}
            onSelectWorkout={(workoutId) => {
              setPrWorkoutId(workoutId);
              // Navigate to workout detail - we'll need to fetch the workout
              setCurrentScreen('history');
            }}
          />
        );
      case 'home':
      default:
        return (
          <HomeScreen
            onAddWorkout={() => {
              setEditingWorkout(null);
              setCurrentScreen('add-workout');
            }}
            onImageSelected={handleImageSelected}
            onUsePastWorkout={() => {
              setEditingWorkout(null);
              setPendingImage(null);
              setCurrentScreen('add-workout');
            }}
            onOpenProfile={() => setCurrentScreen('profile')}
            ringsKey={homeRingsKey}
          />
        );
    }
  };

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
          key={currentScreen}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {renderScreen()}
        </motion.div>
      </AnimatePresence>

      {/* Bottom Navigation - only on main screens */}
      {showBottomNav && (
        <BottomNav
          currentScreen={currentScreen}
          onNavigate={(screen) => setCurrentScreen(screen)}
        />
      )}
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
