"use strict";

/**
 * SECURE INVITATION SERVICE — NOT DEPLOYED YET
 * Run only after Firebase Auth, App Check, Blaze billing and the HMAC secret
 * have been set up. No Google Drive photo access is implemented here.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { createHmac, randomBytes } = require("node:crypto");

if (!getApps().length) initializeApp();

const db = getFirestore();
const CODE_SECRET = defineSecret("INVITATION_CODE_HMAC_KEY");
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 distinct symbols
const VALID_CODE = /^[A-HJ-NP-Z2-9]{8}$/;
const REGION = "asia-southeast1";
const MAX_ATTEMPTS_PER_SESSION = 8;
const MAX_ATTEMPTS_PER_NETWORK = 80;
const WINDOW_MS = 10 * 60 * 1000;

function normalizeCode(value) {
  return String(value || "").toUpperCase().replace(/[\s-]/g, "");
}

function hmac(value) {
  return createHmac("sha256", CODE_SECRET.value()).update(value).digest("hex");
}

function makeCode() {
  const bytes = randomBytes(8);
  return Array.from(bytes, (n) => LETTERS[n & 31]).join("");
}

function requireAuth(request) {
  if (!request.auth || !request.auth.uid)
    throw new HttpsError("unauthenticated", "A temporary guest session is required.");
}

async function recordAttempt(request) {
  const now = Date.now();
  const userId = request.auth.uid;
  const keys = ["uid_" + hmac(userId)];
  const networkAddress = request.rawRequest && request.rawRequest.ip;
  if (networkAddress) keys.push("ip_" + hmac(networkAddress));
  const refs = keys.map((key) => db.collection("invitationAttemptLimits").doc(key));

  await db.runTransaction(async (tx) => {
    // Read all relevant documents before writing any of them.
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const changes = snaps.map((snap, index) => {
      const info = snap.exists ? snap.data() : {};
      const previousWindow = Number(info.windowStartedAt || 0);
      const recent = now - previousWindow >= 0 && now - previousWindow < WINDOW_MS;
      const count = recent ? Number(info.count || 0) : 0;
      const allowed = index === 0 ? MAX_ATTEMPTS_PER_SESSION : MAX_ATTEMPTS_PER_NETWORK;
      if (count >= allowed) {
        throw new HttpsError(
          "resource-exhausted",
          "Too many attempts. Try again later or ask the coordinator."
        );
      }
      return {
        windowStartedAt: recent ? previousWindow : now,
        count: count + 1,
        updatedAt: FieldValue.serverTimestamp(),
        // Firestore TTL can be enabled for this field in production.
        expireAt: Timestamp.fromMillis(now + 24 * 60 * 60 * 1000),
      };
    });
    changes.forEach((data, i) => tx.set(refs[i], data));
  });
}

exports.redeemInvitation = onCall(
  {
    region: REGION,
    secrets: [CODE_SECRET],
    enforceAppCheck: true,
    maxInstances: 8,
    timeoutSeconds: 20,
  },
  async (request) => {
    requireAuth(request);
    const code = normalizeCode(request.data && request.data.code);
    if (!VALID_CODE.test(code))
      throw new HttpsError("invalid-argument", "Enter the eight-character code.");

    // Rate limiting always happens before checking whether a code exists.
    await recordAttempt(request);

    const codeDoc = await db.collection("invitationCodes").doc(hmac(code)).get();
    if (!codeDoc.exists || codeDoc.get("status") !== "active") {
      throw new HttpsError("permission-denied", "Invalid or inactive invitation.");
    }

    const schedule = await db.doc("weddingSettings/camera").get();
    if (!schedule.exists)
      throw new HttpsError("failed-precondition", "The wedding schedule has not been configured.");

    const start = schedule.get("openAt");
    const end = schedule.get("closeAt");
    if (!start || !end || typeof start.toMillis !== "function" || typeof end.toMillis !== "function" || start.toMillis() >= end.toMillis()) {
      throw new HttpsError("failed-precondition", "The camera access window is incomplete.");
    }

    const now = Date.now();
    const cameraOpen = now >= start.toMillis() && now < end.toMillis();

    await db.collection("guestSessions").doc(request.auth.uid).set(
      {
        invitationId: codeDoc.get("invitationId") || codeDoc.id,
        invitedParty: codeDoc.get("partyLabel") || "",
        createdAt: FieldValue.serverTimestamp(),
        validUntil: end,
      },
      { merge: true }
    );

    // The camera upload endpoint MUST separately confirm both this session
    // and the server-side event window; the response here is NOT upload authorization.
    return {
      verified: true,
      cameraOpen,
      openAt: start.toDate().toISOString(),
      closeAt: end.toDate().toISOString(),
    };
  }
);

exports.createInvitation = onCall(
  {
    region: REGION,
    secrets: [CODE_SECRET],
    enforceAppCheck: true,
    maxInstances: 4,
  },
  async (request) => {
    requireAuth(request);
    if (request.auth.token.admin !== true) {
      throw new HttpsError("permission-denied", "Only an authorized organizer can issue invitations.");
    }

    const partyLabel = String(request.data && request.data.partyLabel || "").trim().slice(0, 120);
    if (!partyLabel) throw new HttpsError("invalid-argument", "An invitation label is required.");

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeCode();
      const digest = hmac(code);
      const invitationId = db.collection("invitationRegistry").doc().id;
      try {
        await db.collection("invitationCodes").doc(digest).create({
          invitationId,
          partyLabel,
          status: "active",
          createdAt: FieldValue.serverTimestamp(),
        });
        await db.collection("invitationRegistry").doc(invitationId).set({
          codeDigest: digest,
          partyLabel,
          createdAt: FieldValue.serverTimestamp(),
          status: "active",
        });
        // Return the code ONCE, to the authorized organizer only.
        // It is not stored in plaintext in Firestore.
        return { invitationId, code, formattedCode: code.slice(0, 4) + "-" + code.slice(4) };
      } catch (err) {
        if (err.code !== 6 && err.code !== "already-exists") throw err;
      }
    }
    throw new HttpsError("internal", "Unable to issue invitation. Try again.");
  }
);
