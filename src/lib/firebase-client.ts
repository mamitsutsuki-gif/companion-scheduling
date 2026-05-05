"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

function getRequired(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function getFirebaseAuthClient() {
  const config = {
    apiKey: getRequired("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: getRequired("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: getRequired("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    appId: getRequired("NEXT_PUBLIC_FIREBASE_APP_ID"),
  };
  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  return { auth, provider };
}
