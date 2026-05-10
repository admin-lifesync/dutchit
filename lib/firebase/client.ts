import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { AppError } from "@/lib/errors/app-error";
import { ERROR_CODES } from "@/lib/errors/error-codes";
import { createLogger } from "@/lib/logger";

const log = createLogger("firebase");

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (appInstance) return appInstance;
  if (!firebaseConfig.apiKey) {
    log.error("Firebase config is missing", {
      hint: "Copy .env.example to .env.local and fill NEXT_PUBLIC_FIREBASE_*",
    });
    throw new AppError(ERROR_CODES.CFG_FIREBASE_MISSING);
  }
  appInstance = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
  log.debug("Firebase app initialised", { projectId: firebaseConfig.projectId });
  return appInstance;
}

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance;
  authInstance = getAuth(getFirebaseApp());
  if (typeof window !== "undefined") {
    setPersistence(authInstance, browserLocalPersistence).catch((err) => {
      // Persistence may fail in private browsing — log and fall back.
      log.warn("Auth persistence unavailable, using in-memory", {
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }
  return authInstance;
}

export function getDb(): Firestore {
  if (dbInstance) return dbInstance;
  dbInstance = getFirestore(getFirebaseApp());
  return dbInstance;
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
