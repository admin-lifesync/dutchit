"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { getFirebaseAuth, googleProvider } from "@/lib/firebase/client";
import { upsertUser } from "@/lib/firebase/firestore";
import { handleError } from "@/lib/errors/handle-error";
import { toAppError } from "@/lib/errors/firebase-error-map";
import { ERROR_CODES } from "@/lib/errors/error-codes";
import { createLogger } from "@/lib/logger";

const authLog = createLogger("auth");

export interface AuthUser {
  uid: string;
  name: string;
  email: string;
  photoURL: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(u: User): AuthUser {
  return {
    uid: u.uid,
    name: u.displayName || u.email?.split("@")[0] || "User",
    email: u.email || "",
    photoURL: u.photoURL,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let auth;
    try {
      auth = getFirebaseAuth();
    } catch (e) {
      // Config missing — surface friendly toast and stop loading. The error.tsx
      // boundary will also catch this if the page renders something that needs
      // Firebase.
      handleError(e, { domain: "auth" });
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(
      auth,
      async (u) => {
        if (u) {
          const next = toAuthUser(u);
          setUser(next);
          try {
            await upsertUser(next);
          } catch (e) {
            // Profile sync failure is non-fatal — log + soft toast.
            handleError(e, {
              domain: "user",
              context: { uid: next.uid },
              toastTitle: "Couldn't sync your profile",
            });
          }
        } else {
          setUser(null);
        }
        setLoading(false);
      },
      (err) => {
        handleError(err, { domain: "auth" });
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      const appError = toAppError(e, "auth");
      // Don't show a toast for "user closed the popup" — it's not really an error.
      if (appError.code === ERROR_CODES.AUTH_POPUP_CLOSED) {
        authLog.debug("Sign-in popup dismissed by user");
        return;
      }
      throw handleError(appError);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      await signOut(auth);
    } catch (e) {
      throw handleError(e, { domain: "auth", toastTitle: "Couldn't sign you out" });
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, signInWithGoogle, logout }),
    [user, loading, signInWithGoogle, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
