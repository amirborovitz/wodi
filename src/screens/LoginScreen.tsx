import { useState } from 'react';
import { motion } from 'framer-motion';
import { FirebaseError } from 'firebase/app';
import { useAuth } from '../context/AuthContext';
import { useEmailCodeSignIn, type EmailCodeSignIn } from '../hooks/useEmailCodeSignIn';
import styles from './LoginScreen.module.css';

// Off until the Apple provider is configured in Firebase — see .env.example.
const APPLE_SIGN_IN_ENABLED = import.meta.env.VITE_APPLE_SIGN_IN === 'true';

function describeSignInError(err: unknown): string {
  const code = err instanceof FirebaseError ? err.code : undefined;
  return code ? `Failed to sign in. (${code})` : 'Failed to sign in. Please try again.';
}

export function LoginScreen() {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [loading, setLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const emailSignIn = useEmailCodeSignIn();

  const handleGoogleSignIn = async () => {
    setLoading('google');
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(describeSignInError(err));
      console.error(err);
    } finally {
      setLoading(null);
    }
  };

  const handleAppleSignIn = async () => {
    setLoading('apple');
    setError(null);
    try {
      await signInWithApple();
    } catch (err) {
      setError(describeSignInError(err));
      console.error(err);
    } finally {
      setLoading(null);
    }
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
          <h1 className={styles.heading}>
            <img className={styles.wordmarkLogo} src="/wodi-logo.svg" alt="wodi" />
          </h1>
          <p className={styles.tagline}>Track. Lift. Show Up.</p>
          <p className={styles.intro}>
            Your CrossFit workout assistant. Log your sessions, scores and weights, keep your whole
            training history, and turn every workout into a WOD poster worth sharing.
          </p>
        </motion.div>

        <motion.div
          className={styles.actions}
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.16, ease: 'easeOut' }}
        >
          {emailSignIn.step !== 'closed' ? (
            <EmailCodeForm signIn={emailSignIn} />
          ) : (
            <>
              {APPLE_SIGN_IN_ENABLED && (
                <button
                  type="button"
                  className={styles.appleButton}
                  onClick={handleAppleSignIn}
                  disabled={loading !== null}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M16.37 1.43c0 1.14-.41 2.2-1.12 3.02-.86.96-2.26 1.7-3.56 1.6a4.3 4.3 0 0 1-.03-.5c0-1.1.48-2.28 1.17-3.05.76-.86 2.08-1.5 3.54-1.57v.5Zm4.3 16.16c-.35.82-.76 1.58-1.24 2.28-.66.98-1.2 1.66-1.62 2.05-.64.64-1.33.97-2.09 1-.55 0-1.2-.16-1.96-.47-.77-.31-1.48-.47-2.13-.47-.67 0-1.39.16-2.17.47-.78.31-1.41.48-1.9.5-.73.03-1.44-.31-2.11-1.03-.43-.4-.99-1.1-1.67-2.1-.73-1.05-1.33-2.26-1.8-3.63-.5-1.47-.75-2.9-.75-4.28 0-1.58.34-2.94 1.02-4.08.53-.92 1.25-1.65 2.15-2.18a5.81 5.81 0 0 1 2.9-.83c.57 0 1.32.18 2.24.53.92.36 1.52.54 1.78.54.2 0 .86-.2 1.98-.61 1.05-.38 1.93-.54 2.65-.49 1.95.16 3.42.93 4.4 2.3-1.74 1.05-2.6 2.52-2.58 4.4.01 1.46.54 2.67 1.57 3.63.47.45 1 .8 1.58 1.04-.13.39-.28.78-.44 1.16Z"
                    />
                  </svg>
                  {loading === 'apple' ? 'Connecting...' : 'Continue with Apple'}
                </button>
              )}

              <button
                type="button"
                className={styles.googleButton}
                onClick={handleGoogleSignIn}
                disabled={loading !== null}
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
                {loading === 'google' ? 'Connecting...' : 'Continue with Google'}
              </button>

              <button
                type="button"
                className={styles.emailLink}
                onClick={emailSignIn.open}
                disabled={loading !== null}
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
            </>
          )}
        </motion.div>

        <footer className={styles.footer}>
          {/* New tab: in the installed app a same-tab link would leave no way back. */}
          <a href="/privacy.html" target="_blank" rel="noopener" className={styles.footerLink}>Privacy Policy</a>
          <a href="/terms.html" target="_blank" rel="noopener" className={styles.footerLink}>Terms</a>
        </footer>
      </motion.div>
    </div>
  );
}

/** Ask for the address, then the 6-digit code from the email. All state lives in useEmailCodeSignIn. */
function EmailCodeForm({ signIn }: { signIn: EmailCodeSignIn }) {
  const onCodeStep = signIn.step === 'code';
  return (
    <motion.form
      key={signIn.step}
      className={styles.emailForm}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      onSubmit={event => {
        event.preventDefault();
        void (onCodeStep ? signIn.verifyCode() : signIn.sendCode());
      }}
    >
      {onCodeStep ? (
        <>
          <label className={styles.fieldLabel} htmlFor="login-code">Enter the 6-digit code</label>
          <input
            id="login-code"
            className={`${styles.field} ${styles.codeField}`}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            value={signIn.code}
            onChange={event => signIn.setCode(event.target.value)}
            disabled={signIn.busy !== null}
            autoFocus
          />
          {signIn.notice && <p className={styles.notice}>{signIn.notice}</p>}
        </>
      ) : (
        <>
          <label className={styles.fieldLabel} htmlFor="login-email">Your email</label>
          <input
            id="login-email"
            className={styles.field}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            value={signIn.email}
            onChange={event => signIn.setEmail(event.target.value)}
            disabled={signIn.busy !== null}
            autoFocus
          />
        </>
      )}

      <button
        type="submit"
        className={styles.primaryButton}
        disabled={signIn.busy !== null || (onCodeStep ? signIn.code.length !== 6 : !signIn.email.trim())}
      >
        {signIn.busy === 'sending' ? 'Sending...'
          : signIn.busy === 'verifying' ? 'Signing in...'
          : onCodeStep ? 'Sign in' : 'Send me a code'}
      </button>

      {signIn.error && (
        <motion.p className={styles.error} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {signIn.error}
        </motion.p>
      )}

      <div className={styles.emailLinks}>
        {onCodeStep ? (
          <>
            <button type="button" className={styles.emailLink} onClick={signIn.changeEmail} disabled={signIn.busy !== null}>
              Use a different email
            </button>
            <button type="button" className={styles.emailLink} onClick={() => void signIn.sendCode()} disabled={signIn.busy !== null}>
              Send a new code
            </button>
          </>
        ) : (
          <button type="button" className={styles.emailLink} onClick={signIn.close} disabled={signIn.busy !== null}>
            Other ways to sign in
          </button>
        )}
      </div>
    </motion.form>
  );
}
