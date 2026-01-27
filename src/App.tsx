import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './screens/LoginScreen';
import { HomeScreen } from './screens/HomeScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { AddWorkoutScreen } from './screens/AddWorkoutScreen';
import { WorkoutDetailScreen } from './screens/WorkoutDetailScreen';
import { BottomNav } from './components/ui';
import type { Screen } from './types';
import type { WorkoutWithStats } from './hooks/useWorkouts';
import './styles/variables.css';

// Screens that show the bottom nav
const MAIN_SCREENS: Screen[] = ['home', 'history'];

function AppContent() {
  const { user, loading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [homeRingsKey, setHomeRingsKey] = useState(0);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutWithStats | null>(null);
  const [editingWorkout, setEditingWorkout] = useState<WorkoutWithStats | null>(null);

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
          <WorkoutDetailScreen
            workout={selectedWorkout}
            onBack={() => setCurrentScreen('history')}
            onEditWorkout={() => handleEditWorkout(selectedWorkout)}
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
        return <ProfileScreen />;
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
