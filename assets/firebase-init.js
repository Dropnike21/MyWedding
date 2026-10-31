// Browser-only Firebase bootstrap. No Authentication, Firestore reads/writes
// or photo uploads are started until security rules and the backend are ready.
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js?v=20261031-1910";

const status = document.querySelector("#firebase-status");

try {
  const app = initializeApp(firebaseConfig);
  if (status) status.textContent = "Web app initialized — services not yet enabled";
  console.info("Firebase app initialized:", app.name);
} catch (error) {
  if (status) status.textContent = "Firebase setup needs attention";
  console.error("Firebase bootstrap failed:", error);
}
