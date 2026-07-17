import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { doc, deleteDoc } from 'firebase/firestore';
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
import { RecordsScreen } from './screens/RecordsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ProfileSettingsScreen, GoalsSettingsScreen } from './components/settings';
import { BottomNav } from './components/ui';
import { WrappedStoryScreen } from './components/recap/WrappedStoryScreen';
import { DEFAULT_USER_GOALS } from './types';
import type { Screen, PlannedWorkout } from './types';
import type { WorkoutWithStats } from './hooks/useWorkouts';
import { markRecapViewed } from './hooks/useRecapData';
import type { RecapData } from './hooks/useRecapData';
import './styles/variables.css';

// Screens that show the bottom nav
const MAIN_SCREENS: Screen[] = ['home', 'history', 'profile', 'stats', 'settings'];

function AppContent() {
  const { user, loading, refreshUser, updateUserProfile, updateUserGoals, signOut } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [homeRingsKey, setHomeRingsKey] = useState(0);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPlannedWorkout, setPendingPlannedWorkout] = useState<PlannedWorkout | null>(null);
  const [showRecentWorkoutsOnOpen, setShowRecentWorkoutsOnOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutWithStats | null>(null);
  const [editingWorkout, setEditingWorkout] = useState<WorkoutWithStats | null>(null);
  const [workoutList, setWorkoutList] = useState<WorkoutWithStats[]>([]);
  const [navDir, setNavDir] = useState<'up' | 'down' | null>(null);
  const [workoutDetailOrigin, setWorkoutDetailOrigin] = useState<'home' | 'history'>('history');
  const [pendingRecapData, setPendingRecapData] = useState<RecapData | null>(null);

  const handleOpenRecap = (recapData: RecapData) => {
    markRecapViewed(recapData);
    setPendingRecapData(recapData);
    setCurrentScreen('recap');
  };
  const handleImageSelected = (file: File) => {
    setPendingImage(file);
    setShowRecentWorkoutsOnOpen(false);
    setEditingWorkout(null); // Clear any editing state
    setCurrentScreen('add-workout');
  };

  const handleEditWorkout = (workout: WorkoutWithStats) => {
    setEditingWorkout(workout);
    setPendingImage(null);
    setShowRecentWorkoutsOnOpen(false);
    setCurrentScreen('add-workout');
  };

  const handleLogPlannedWorkout = (planned: PlannedWorkout) => {
    setPendingPlannedWorkout(planned);
    setPendingImage(null);
    setShowRecentWorkoutsOnOpen(false);
    setEditingWorkout(null);
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
  const needsOnboarding = user.onboardingComplete === false;

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
              setShowRecentWorkoutsOnOpen(false);
              setEditingWorkout(null);
              setPendingPlannedWorkout(null);
              setCurrentScreen(editingWorkout ? 'workout-detail' : 'home');
            }}
            onWorkoutCreated={async () => {
              if (pendingPlannedWorkout?.id) {
                try {
                  await deleteDoc(doc(db, 'savedWods', pendingPlannedWorkout.id));
                } catch (err) {
                  console.error('[SavedWod] Failed to remove logged saved WOD:', err);
                }
              }
              setPendingImage(null);
              setShowRecentWorkoutsOnOpen(false);
              setEditingWorkout(null);
              setPendingPlannedWorkout(null);
              setHomeRingsKey((prev) => prev + 1);
              setCurrentScreen('home');
            }}
            onSavedForLater={() => {
              setPendingImage(null);
              setShowRecentWorkoutsOnOpen(false);
              setEditingWorkout(null);
              setPendingPlannedWorkout(null);
              setCurrentScreen('home');
            }}
            initialImage={pendingImage}
            showRecentOnOpen={showRecentWorkoutsOnOpen}
            editWorkout={editingWorkout}
            plannedWorkout={pendingPlannedWorkout}
          />
        );
      case 'workout-detail': {
        const selectedIdx = workoutList.findIndex(w => w.id === selectedWorkout?.id);
        const enterFrom = navDir === 'up' ? 'bottom' : navDir === 'down' ? 'top' : undefined;
        return selectedWorkout ? (
          <WorkoutScreen
            key={selectedWorkout.id}
            mode="detail"
            enterFrom={enterFrom}
            workout={selectedWorkout}
            onBack={() => { setNavDir(null); setCurrentScreen(workoutDetailOrigin); }}
            onEditWorkout={() => handleEditWorkout(selectedWorkout)}
            onPrevWorkout={selectedIdx > 0 ? () => {
              setNavDir('down');
              setSelectedWorkout(workoutList[selectedIdx - 1]);
            } : undefined}
            onNextWorkout={selectedIdx < workoutList.length - 1 ? () => {
              setNavDir('up');
              setSelectedWorkout(workoutList[selectedIdx + 1]);
            } : undefined}
          />
        ) : (
          <HistoryScreen
            onSelectWorkout={(workout, sortedList) => {
              setSelectedWorkout(workout);
              setWorkoutList(sortedList);
              setWorkoutDetailOrigin('history');
              setCurrentScreen('workout-detail');
            }}
          />
        );
      }
      case 'history':
        return (
          <HistoryScreen
            onSelectWorkout={(workout, sortedList) => {
              setNavDir(null);
              setSelectedWorkout(workout);
              setWorkoutList(sortedList);
              setWorkoutDetailOrigin('history');
              setCurrentScreen('workout-detail');
            }}
          />
        );
      case 'profile':
        return (
          <ProfileScreen
            onNavigateToPR={() => setCurrentScreen('pr')}
            onNavigateToRecords={() => setCurrentScreen('records')}
            onNavigateToSettings={() => setCurrentScreen('settings')}
            onOpenRecap={handleOpenRecap}
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
              void workoutId;
              setCurrentScreen('history');
            }}
          />
        );
      case 'records':
        return (
          <RecordsScreen
            onBack={() => setCurrentScreen('profile')}
          />
        );
      case 'recap':
        return pendingRecapData ? (
          <WrappedStoryScreen
            data={pendingRecapData}
            onClose={() => { setPendingRecapData(null); setCurrentScreen('home'); }}
          />
        ) : null;
      case 'home':
      default:
        return (
          <HomeScreen
            onAddWorkout={() => {
              setEditingWorkout(null);
              setPendingImage(null);
              setPendingPlannedWorkout(null);
              setShowRecentWorkoutsOnOpen(false);
              setCurrentScreen('add-workout');
            }}
            onImageSelected={handleImageSelected}
            onOpenProfile={() => setCurrentScreen('profile')}
            onSelectWorkout={(workout, sortedList) => {
              setNavDir(null);
              setSelectedWorkout(workout);
              setWorkoutList(sortedList);
              setWorkoutDetailOrigin('home');
              setCurrentScreen('workout-detail');
            }}
            onLogPlannedWorkout={handleLogPlannedWorkout}
            onOpenRecap={handleOpenRecap}
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
