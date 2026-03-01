import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import styles from './LoginScreen.module.css';

export function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError('Failed to sign in. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = () => {
    setError('Apple sign-in is not available yet.');
  };

  const handleEmailSignIn = () => {
    setError('Email sign-in is not available yet.');
  };

  return (
    <div className={styles.container}>
      <div className={styles.logoGlow} />

      <motion.div
        className={styles.content}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        <motion.div
          className={styles.brand}
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.06, ease: 'easeOut' }}
        >
          <h1 className={styles.wordmark}>
            <span>wod</span>
            <span className={styles.iAccent}>i</span>
          </h1>
          <p className={styles.tagline}>Track. Lift. Show Up.</p>
        </motion.div>

        <motion.div
          className={styles.actions}
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.16, ease: 'easeOut' }}
        >
          <button
            type="button"
            className={styles.appleButton}
            onClick={handleAppleSignIn}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M16.37 1.43c0 1.14-.41 2.2-1.12 3.02-.86.96-2.26 1.7-3.56 1.6a4.3 4.3 0 0 1-.03-.5c0-1.1.48-2.28 1.17-3.05.76-.86 2.08-1.5 3.54-1.57v.5Zm4.3 16.16c-.35.82-.76 1.58-1.24 2.28-.66.98-1.2 1.66-1.62 2.05-.64.64-1.33.97-2.09 1-.55 0-1.2-.16-1.96-.47-.77-.31-1.48-.47-2.13-.47-.67 0-1.39.16-2.17.47-.78.31-1.41.48-1.9.5-.73.03-1.44-.31-2.11-1.03-.43-.4-.99-1.1-1.67-2.1-.73-1.05-1.33-2.26-1.8-3.63-.5-1.47-.75-2.9-.75-4.28 0-1.58.34-2.94 1.02-4.08.53-.92 1.25-1.65 2.15-2.18a5.81 5.81 0 0 1 2.9-.83c.57 0 1.32.18 2.24.53.92.36 1.52.54 1.78.54.2 0 .86-.2 1.98-.61 1.05-.38 1.93-.54 2.65-.49 1.95.16 3.42.93 4.4 2.3-1.74 1.05-2.6 2.52-2.58 4.4.01 1.46.54 2.67 1.57 3.63.47.45 1 .8 1.58 1.04-.13.39-.28.78-.44 1.16Z"
              />
            </svg>
            Continue with Apple
          </button>

          <button
            type="button"
            className={styles.googleButton}
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {loading ? 'Connecting...' : 'Continue with Google'}
          </button>

          <button
            type="button"
            className={styles.emailLink}
            onClick={handleEmailSignIn}
          >
            Use Email
          </button>

          {error && (
            <motion.p
              className={styles.error}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.p>
          )}
        </motion.div>

        <footer className={styles.footer}>
          <a href="#" className={styles.footerLink}>Privacy Policy</a>
          <a href="#" className={styles.footerLink}>Terms</a>
        </footer>
      </motion.div>
    </div>
  );
}
