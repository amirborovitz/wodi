import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './screens/LoginScreen';
import { HomeScreen } from './screens/HomeScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { StatsScreen } from './screens/StatsScreen';
import { AddWorkoutScreen } from './screens/AddWorkoutScreen';
import { FloatingDock } from './components/ui';
import type { Screen } from './types';
import './styles/variables.css';

// Screens that show the bottom nav
const MAIN_SCREENS: Screen[] = ['home', 'history', 'stats'];

function AppContent() {
  const { user, loading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [pendingImage, setPendingImage] = useState<File | null>(null);

  const handleImageSelected = (file: File) => {
    setPendingImage(file);
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
              setCurrentScreen('home');
            }}
            onWorkoutCreated={() => {
              setPendingImage(null);
              setCurrentScreen('home');
            }}
            initialImage={pendingImage}
          />
        );
      case 'history':
        return <HistoryScreen />;
      case 'stats':
        return <StatsScreen />;
      case 'home':
      default:
        return (
          <HomeScreen
            onAddWorkout={() => setCurrentScreen('add-workout')}
            onImageSelected={handleImageSelected}
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

      {/* Floating Dock Navigation - only on main screens */}
      {showBottomNav && (
        <FloatingDock
          currentScreen={currentScreen}
          onNavigate={(screen) => setCurrentScreen(screen)}
          onAddWorkout={() => setCurrentScreen('add-workout')}
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
