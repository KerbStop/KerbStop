// The sign-in token from POST /api/auth/login, kept in this browser.
import { useSyncExternalStore } from 'react';

const TOKEN_KEY = 'kerbstop.token';
const EMAIL_KEY = 'kerbstop.email';
const AFTER_VERIFY_KEY = 'kerbstop.after-verify';
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private windows can block storage; the user just signs in again.
  }
}

export const getToken = () => read(TOKEN_KEY);
export const getEmail = () => read(EMAIL_KEY);

export function saveSession(token: string, email: string) {
  write(TOKEN_KEY, token);
  write(EMAIL_KEY, email);
  listeners.forEach((listener) => listener());
}

export function clearSession() {
  write(TOKEN_KEY, null);
  write(EMAIL_KEY, null);
  listeners.forEach((listener) => listener());
}

/** The signed-in email, or null. Re-renders when the user signs in or out. */
export function useSignedInEmail(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (getToken() ? getEmail() : null),
  );
}

/** Where to come back to after the Stripe Identity page. */
export const rememberAfterVerify = (path: string) => write(AFTER_VERIFY_KEY, path);
export const takeAfterVerify = () => {
  const path = read(AFTER_VERIFY_KEY);
  write(AFTER_VERIFY_KEY, null);
  return path;
};
