"use strict";

/**
 * One-time organizer-role bootstrap from a trusted ADMIN environment.
 *
 * Requirements:
 *   - Firebase Admin SDK installed in functions/node_modules.
 *   - Google Application Default Credentials with Firebase Auth admin rights.
 *   - Never run from the browser or publish service-account credentials.
 *
 * Run:
 *   cd functions
 *   node scripts/grant-admin.js <FIREBASE_AUTH_UID>
 */
const readline = require("node:readline");
const { initializeApp, applicationDefault, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const PROJECT_ID = "mywedding-1ad09";

async function main() {
  const uid = process.argv[2];
  if (!uid || !/^[A-Za-z0-9_-]{8,128}$/.test(uid))
    throw new Error("Provide a valid Firebase Authentication user UID.");

  if (!process.stdin.isTTY)
    throw new Error("Granting the organizer role requires an interactive terminal.");

  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }

  const auth = getAuth();
  const user = await auth.getUser(uid);
  if (user.providerData.length === 0 || user.providerData.every(p => p.providerId !== "google.com"))
    throw new Error("Only an existing Google-authenticated organizer account can receive this role.");

  const answer = await new Promise(resolve => {
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
    terminal.question(
      "Grant full wedding admin access to " + (user.email || uid) +
      " (UID " + uid + ")? Type GRANT to continue: ",
      text => {terminal.close();resolve(text);}
    );
  });

  if (answer !== "GRANT") {
    console.log("Cancelled. No changes made.");
    return;
  }
  await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), admin: true });
  console.log("Organizer role granted. Ask the organizer to sign out and sign in again.");
}

main().catch(err => {
  console.error("Could not grant organizer role:", err.message);
  process.exitCode = 1;
});
