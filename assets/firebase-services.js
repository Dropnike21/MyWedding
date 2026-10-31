/**
 * Shared Firebase client initialization for the static GitHub Pages frontend.
 * No secrets are present here. Backend operations require Auth + App Check.
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
import { firebaseConfig } from "./firebase-config.js?v=20261031-1815";
import { guestAccessConfig } from "./guest-config.js?v=20261031-1815";

let appCheckInitialized = false;

export function getWeddingClient() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return { app, auth: getAuth(app) };
}

export function enableAppCheck() {
  if (!guestAccessConfig.appCheckSiteKey) {
    throw new Error("The Firebase App Check site key has not been configured yet.");
  }
  const { app } = getWeddingClient();
  if (!appCheckInitialized) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(guestAccessConfig.appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialized = true;
  }
}

export function callWeddingFunction(functionName) {
  enableAppCheck();
  const { app } = getWeddingClient();
  return httpsCallable(getFunctions(app, guestAccessConfig.region), functionName);
}
