"use strict";

/**
 * MyWedding invitation service (source only — not deployed).
 *
 * A guest uses a short bearer code. The raw code is shown once to the
 * authorized organizer; Firestore contains HMAC digests, never plain codes.
 * Regeneration atomically removes the old code index and increments a
 * revision. Every camera request must recheck that revision on the server.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { createHmac, randomBytes } = require("node:crypto");

if (!getApps().length) initializeApp();
const db = getFirestore();
const CODE_SECRET = defineSecret("INVITATION_CODE_HMAC_KEY");
const REGION = "asia-southeast1";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_UID_ATTEMPTS = 8;
const MAX_IP_ATTEMPTS = 80;

function hash(value) {
  return createHmac("sha256", CODE_SECRET.value()).update(String(value)).digest("hex");
}
function generateCode() {
  return Array.from(randomBytes(8), byte => ALPHABET[byte & 31]).join("");
}
function normalizeCode(value) {
  return String(value || "").toUpperCase().replace(/[\s-]/g, "");
}
function idField(value, name = "record") {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(id))
    throw new HttpsError("invalid-argument", "Choose a valid " + name + ".");
  return id;
}
function requireUser(request) {
  if (!request.auth || !request.auth.uid)
    throw new HttpsError("unauthenticated", "A session is required.");
}
function requireAdmin(request) {
  requireUser(request);
  if (request.auth.token.admin !== true ||
      request.auth.token.firebase?.sign_in_provider === "anonymous")
    throw new HttpsError("permission-denied", "Organizer access is required.");
}
function textField(value, field, max = 120) {
  const result = String(value || "").trim();
  if (!result || result.length > max)
    throw new HttpsError("invalid-argument", field + " is required (max " + max + " characters).");
  return result;
}
function optionalText(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}
function enumField(value, valid, label, fallback) {
  const candidate = String(value || fallback || "");
  if (!valid.includes(candidate))
    throw new HttpsError("invalid-argument", "Choose a valid " + label + ".");
  return candidate;
}
function seatsField(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 30)
    throw new HttpsError("invalid-argument", "Enter between 1 and 30 invited seats.");
  return count;
}
function registrationFields(data) {
  return {
    partyLabel: textField(data.partyLabel, "Guest or family name"),
    side: enumField(data.side, ["Angela", "Joseph", "Shared"], "side", "Shared"),
    invitedSeats: seatsField(data.invitedSeats ?? 1),
    rsvp: enumField(data.rsvp, ["Pending", "Yes", "No", "Maybe"], "RSVP", "Pending"),
    notes: optionalText(data.notes),
  };
}
function publicInvitation(snapshot) {
  const v = snapshot.data();
  return {
    id: snapshot.id,
    partyLabel: v.partyLabel,
    side: v.side || "Shared",
    invitedSeats: v.invitedSeats || 1,
    rsvp: v.rsvp || "Pending",
    confirmedSeats: Number(v.confirmedSeats || 0),
    notes: v.notes || "",
    status: v.status,
    revision: Number(v.revision || 1),
    hasActiveCode: v.status === "active" && Boolean(v.codeDigest),
    createdAt: v.createdAt?.toDate?.().toISOString() || null,
    updatedAt: v.updatedAt?.toDate?.().toISOString() || null,
  };
}
async function recordAttempt(request) {
  const now = Date.now();
  const keys = ["uid_" + hash(request.auth.uid)];
  const ip = request.rawRequest?.ip;
  if (ip) keys.push("ip_" + hash(ip));
  const refs = keys.map(key => db.collection("invitationAttemptLimits").doc(key));

  await db.runTransaction(async tx => {
    const snaps = await Promise.all(refs.map(ref => tx.get(ref)));
    const updates = snaps.map((snap, i) => {
      const data = snap.exists ? snap.data() : {};
      const start = Number(data.windowStartedAt || 0);
      const inWindow = now >= start && now - start < RATE_WINDOW_MS;
      const used = inWindow ? Number(data.count || 0) : 0;
      if (used >= (i === 0 ? MAX_UID_ATTEMPTS : MAX_IP_ATTEMPTS))
        throw new HttpsError("resource-exhausted", "Too many attempts. Please try later.");
      return {
        windowStartedAt: inWindow ? start : now,
        count: used + 1,
        updatedAt: FieldValue.serverTimestamp(),
        expireAt: Timestamp.fromMillis(now + 24 * 60 * 60 * 1000),
      };
    });
    updates.forEach((value, i) => tx.set(refs[i], value));
  });
}
async function eventWindow() {
  const schedule = await db.doc("weddingSettings/camera").get();
  const start = schedule.get("openAt");
  const end = schedule.get("closeAt");
  if (!start?.toMillis || !end?.toMillis || start.toMillis() >= end.toMillis())
    throw new HttpsError("failed-precondition", "Wedding camera schedule is not ready.");
  const now = Date.now();
  return {
    start, end,
    cameraOpen: now >= start.toMillis() && now < end.toMillis(),
  };
}
function configuration(options = {}, withSecret = true) {
  return {
    region: REGION,
    enforceAppCheck: true,
    maxInstances: 6,
    timeoutSeconds: 30,
    ...(withSecret ? { secrets: [CODE_SECRET] } : {}),
    ...options,
  };
}
function isDuplicate(error) {
  return error.code === 6 || error.code === "already-exists";
}
function oneTimeCodeResponse(id, code, revision) {
  return {
    invitationId: id,
    code,
    formattedCode: code.slice(0, 4) + "-" + code.slice(4),
    revision,
  };
}

/**
 * Issue an invitation. No plaintext code is stored in Firestore.
 * A retry handles the extraordinarily unlikely random-code collision.
 */
exports.createInvitation = onCall(configuration(), async request => {
  requireAdmin(request);
  const values = registrationFields(request.data || {});
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    const digest = hash(code);
    const invitation = db.collection("invitationRegistry").doc();
    const batch = db.batch();
    batch.create(db.collection("invitationCodes").doc(digest), {
      invitationId: invitation.id,
      revision: 1,
      status: "active",
    });
    batch.create(invitation, {
      ...values,
      codeDigest: digest,
      revision: 1,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    try {
      await batch.commit();
      return { ...oneTimeCodeResponse(invitation.id, code, 1), record: publicInvitation({
        id: invitation.id,
        data: () => ({ ...values, status: "active", revision: 1, codeDigest: digest }),
      }) };
    } catch (error) {
      if (!isDuplicate(error)) throw error;
    }
  }
  throw new HttpsError("internal", "Could not issue a unique code.");
});

/** Private invitation register. This NEVER returns plaintext codes. */
exports.listInvitations = onCall(configuration({}, false), async request => {
  requireAdmin(request);
  const snapshot = await db.collection("invitationRegistry").orderBy("createdAt", "desc").limit(300).get();
  return { items: snapshot.docs.map(publicInvitation) };
});

/** Update guest/family information without changing the existing code. */
exports.updateInvitation = onCall(configuration({}, false), async request => {
  requireAdmin(request);
  const data = request.data || {};
  const id = idField(data.invitationId, "invitation");
  const values = registrationFields(data);
  const ref = db.collection("invitationRegistry").doc(id);
  await db.runTransaction(async tx => {
    const existing = await tx.get(ref);
    if (!existing.exists) throw new HttpsError("not-found", "Invitation not found.");
    tx.update(ref, { ...values, updatedAt: FieldValue.serverTimestamp() });
  });
  return { saved: true, invitationId: id };
});

/**
 * Regenerate invitation: delete old code index and increment revision IN ONE
 * Firestore transaction. Concurrent rotations cannot preserve the old code.
 * Issued guest sessions have an old revision and must be rejected by the
 * protected upload and gallery endpoints (not implemented yet).
 */
exports.rotateInvitation = onCall(configuration(), async request => {
  requireAdmin(request);
  const id = idField(request.data?.invitationId, "invitation");
  const ref = db.collection("invitationRegistry").doc(id);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const digest = hash(code);
    const nextIndex = db.collection("invitationCodes").doc(digest);
    try {
      const revision = await db.runTransaction(async tx => {
        const [oldSnap, codeSnap] = await Promise.all([tx.get(ref), tx.get(nextIndex)]);
        if (!oldSnap.exists)
          throw new HttpsError("not-found", "Invitation not found.");
        if (codeSnap.exists)
          throw new HttpsError("already-exists", "Code collision; retry.");
        const old = oldSnap.data();
        const nextRevision = Number(old.revision || 1) + 1;
        const previousHash = old.codeDigest || null;
        if (previousHash) tx.delete(db.collection("invitationCodes").doc(previousHash));
        tx.create(nextIndex, { invitationId: id, revision: nextRevision, status: "active" });
        tx.update(ref, {
          codeDigest: digest,
          status: "active",
          revision: nextRevision,
          rotatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return nextRevision;
      });
      return oneTimeCodeResponse(id, code, revision);
    } catch (error) {
      if (!isDuplicate(error)) throw error;
    }
  }
  throw new HttpsError("internal", "Could not generate a new code.");
});

/** Disable access without deleting invitation history. Re-issue via Rotate. */
exports.revokeInvitation = onCall(configuration({}, false), async request => {
  requireAdmin(request);
  const id = idField(request.data?.invitationId, "invitation");
  const ref = db.collection("invitationRegistry").doc(id);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Invitation not found.");
    const old = snap.data();
    if (old.codeDigest)
      tx.delete(db.collection("invitationCodes").doc(old.codeDigest));
    tx.update(ref, {
      status: "revoked",
      codeDigest: null,
      revision: Number(old.revision || 1) + 1,
      updatedAt: FieldValue.serverTimestamp(),
      revokedAt: FieldValue.serverTimestamp(),
    });
  });
  return { revoked: true, invitationId: id };
});

/**
 * Code redemption is serialized with rotations/revocations using a transaction.
 * The session binds to the CURRENT invitation revision, not just a guest name.
 */
exports.redeemInvitation = onCall(configuration({ maxInstances: 8 }), async request => {
  requireUser(request);
  const code = normalizeCode(request.data?.code);
  if (!CODE_PATTERN.test(code))
    throw new HttpsError("invalid-argument", "Invalid code format.");
  await recordAttempt(request);
  const window = await eventWindow();
  const digest = hash(code);
  const indexRef = db.collection("invitationCodes").doc(digest);
  const sessionRef = db.collection("guestSessions").doc(request.auth.uid);
  const result = await db.runTransaction(async tx => {
    const indexSnap = await tx.get(indexRef);
    if (!indexSnap.exists || indexSnap.get("status") !== "active")
      throw new HttpsError("permission-denied", "Invalid or expired invitation.");
    const invitationId = indexSnap.get("invitationId");
    const invitationRef = db.collection("invitationRegistry").doc(invitationId);
    const activeSnap = await tx.get(invitationRef);
    if (!activeSnap.exists || activeSnap.get("status") !== "active" ||
        activeSnap.get("codeDigest") !== digest ||
        Number(activeSnap.get("revision")) !== Number(indexSnap.get("revision")))
      throw new HttpsError("permission-denied", "Invalid or expired invitation.");
    tx.set(sessionRef, {
      invitationId,
      revision: Number(activeSnap.get("revision")),
      validUntil: window.end,
      redeemedAt: FieldValue.serverTimestamp(),
    });
    return {
      partyLabel: activeSnap.get("partyLabel"),
      invitedSeats: Number(activeSnap.get("invitedSeats") || 1),
      rsvp: activeSnap.get("rsvp") || "Pending",
      confirmedSeats: Number(activeSnap.get("confirmedSeats") || 0),
    };
  });
  return {
    verified: true,
    cameraOpen: window.cameraOpen,
    invitation: result,
    // Only the matching invited party's own details are returned after code verification.
    openAt: window.start.toDate().toISOString(),
    closeAt: window.end.toDate().toISOString(),
  };
});

/**
 * A reusable server-side validation for future protected photo endpoints.
 * Re-read invitation + session for EVERY upload/download request. Never trust
 * a previously returned cameraOpen flag or guest-supplied invitationId.
 */
async function activeGuestSession(uid) {
  const session = await db.collection("guestSessions").doc(uid).get();
  if (!session.exists)
    throw new HttpsError("permission-denied", "Please enter your invitation code.");
  const sessionData = session.data();
  const invitation = await db.collection("invitationRegistry").doc(sessionData.invitationId).get();
  if (!invitation.exists || invitation.get("status") !== "active" ||
      Number(invitation.get("revision")) !== Number(sessionData.revision) ||
      !invitation.get("codeDigest") ||
      !sessionData.validUntil?.toMillis ||
      sessionData.validUntil.toMillis() <= Date.now()) {
    throw new HttpsError("permission-denied", "This invitation session has expired. Enter the current code.");
  }
  return { invitationId: invitation.id, revision: Number(invitation.get("revision")) };
}
exports.checkGuestSession = onCall(configuration({}, false), async request => {
  requireUser(request);
  await activeGuestSession(request.auth.uid);
  const window = await eventWindow();
  return { valid: true, cameraOpen: window.cameraOpen };
});

// Important: no upload function exists yet. Drive OAuth, content validation,
// anti-abuse quotas, and server-side gallery release are separate work.


/**
 * RSVP by invitation holder, without registration.
 * The transaction reads the session and CURRENT invitation revision, so old
 * sessions cannot edit RSVPs after a code is rotated or revoked.
 */
exports.respondToInvitation = onCall(configuration({}, false), async request => {
  requireUser(request);
  const rsvp = enumField(request.data?.rsvp, ["Yes", "No", "Maybe"], "RSVP", "");
  const sessionRef = db.collection("guestSessions").doc(request.auth.uid);
  const result = await db.runTransaction(async tx => {
    const session = await tx.get(sessionRef);
    if (!session.exists)
      throw new HttpsError("permission-denied", "Please verify the invitation first.");
    const { invitationId, revision, validUntil } = session.data();
    if (!validUntil?.toMillis || Date.now() >= validUntil.toMillis())
      throw new HttpsError("permission-denied", "This invitation session has expired.");
    const invitationRef = db.collection("invitationRegistry").doc(invitationId);
    const invitation = await tx.get(invitationRef);
    if (!invitation.exists || invitation.get("status") !== "active" ||
        Number(invitation.get("revision")) !== Number(revision))
      throw new HttpsError("permission-denied", "This code was replaced or revoked. Open the latest invitation link.");

    const maxSeats = Number(invitation.get("invitedSeats") || 1);
    const attending = rsvp === "Yes" ? Number(request.data?.attendingSeats) : 0;
    if (rsvp === "Yes" &&
        (!Number.isInteger(attending) || attending < 1 || attending > maxSeats))
      throw new HttpsError("invalid-argument", "Choose 1 to " + maxSeats + " attending.");
    // One guest/family response is stored on the invitation, not per device.
    // A family may submit a later correction from any device with its code.
    tx.update(invitationRef, {
      rsvp,
      confirmedSeats: attending,
      respondedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { rsvp, confirmedSeats: attending };
  });
  return { saved: true, ...result };
});
