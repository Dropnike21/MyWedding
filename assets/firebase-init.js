// Browser-only Firebase bootstrap. No Authentication, Firestore reads/writes
// or photo uploads are started until security rules and the backend are ready.
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js?v=20261031-2115";

const status = document.querySelector("#firebase-status");

try {
  const app = getApps().find(item => item.name === "[DEFAULT]") || initializeApp(firebaseConfig);
  if (status) status.textContent = "Firebase client ready. Planner access is available; guest camera backend and Drive uploads are still pending.";
  console.info("Firebase app initialized:", app.name);
} catch (error) {
  if (status) status.textContent = "Firebase setup needs attention";
  console.error("Firebase bootstrap failed:", error);
}
