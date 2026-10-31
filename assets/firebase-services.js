/**
 * Shared Firebase initialization for the static GitHub Pages frontend.
 * Planner and guest camera use separate Firebase app instances so Google
 * organizer auth and persistent anonymous guest auth never replace each other.
 */
import {
  initializeApp, getApp, getApps
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  initializeAppCheck, ReCaptchaEnterpriseProvider
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app-check.js";
import {
  getFunctions, httpsCallable
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js";
import {
  getAuth
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js?v=20261031-1845";
import { guestAccessConfig } from "./guest-config.js?v=20261031-1845";

let plannerAppCheckInitialized = false;
let guestAppCheckInitialized = false;

export function getWeddingClient() {
  const app = getApps().find(item => item.name === "[DEFAULT]")
    || initializeApp(firebaseConfig);
  return { app, auth: getAuth(app) };
}

export function getGuestClient() {
  const existing = getApps().find(item => item.name === "wedding-guest");
  const app = existing || initializeApp(firebaseConfig, "wedding-guest");
  return { app, auth: getAuth(app) };
}

export function enableAppCheck() {
  if (!guestAccessConfig.appCheckSiteKey) {
    throw new Error("The Firebase App Check site key has not been configured yet.");
  }
  const { app } = getWeddingClient();
  if (!plannerAppCheckInitialized) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(guestAccessConfig.appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    plannerAppCheckInitialized = true;
  }
}

export function enableGuestAppCheck() {
  if (!guestAccessConfig.appCheckSiteKey) {
    throw new Error("The Firebase App Check site key has not been configured yet.");
  }
  const { app } = getGuestClient();
  if (!guestAppCheckInitialized) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(guestAccessConfig.appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    guestAppCheckInitialized = true;
  }
}

export function callWeddingFunction(functionName) {
  enableAppCheck();
  const { app } = getWeddingClient();
  return httpsCallable(getFunctions(app, guestAccessConfig.region), functionName);
}

export function callGuestFunction(functionName) {
  enableGuestAppCheck();
  const { app } = getGuestClient();
  return httpsCallable(getFunctions(app, guestAccessConfig.region), functionName);
}
