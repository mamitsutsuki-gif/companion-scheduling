"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseWebDefaults = {
  apiKey: "AIzaSyCuNs0DEgQabXmTWdCWmYeL7CCMrSvTbxk",
  authDomain: "motive-iji-cloud-1e300.firebaseapp.com",
  projectId: "motive-iji-cloud-1e300",
  appId: "1:1061603235449:web:279b02adf218945e17e6a8",
} as const;

function getRequired(name: string) {
  const value = process.env[name];
  if (value) return value;
  if (name === "NEXT_PUBLIC_FIREBASE_API_KEY") return firebaseWebDefaults.apiKey;
  if (name === "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN") return firebaseWebDefaults.authDomain;
  if (name === "NEXT_PUBLIC_FIREBASE_PROJECT_ID") return firebaseWebDefaults.projectId;
  if (name === "NEXT_PUBLIC_FIREBASE_APP_ID") return firebaseWebDefaults.appId;
  throw new Error(`${name} is not set`);
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
