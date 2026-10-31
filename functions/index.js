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
const { google } = require("googleapis");

if (!getApps().length) initializeApp();
const db = getFirestore();
const CODE_SECRET = defineSecret("INVITATION_CODE_HMAC_KEY");
const DRIVE_OAUTH_SECRET = defineSecret("GOOGLE_DRIVE_OAUTH");
const DRIVE_PARENT_FOLDER_ID = "1ynfDsAZjs4Nf-_NQOYR8k8T_UbVtkvYj";
const DRIVE_RAW_FOLDER_ID = "1zug2sW_wvAooJH84gjHu2zqxUUVk2XtN";
const DRIVE_WATERMARKED_FOLDER_ID = "1ExaPGWwiyOSxp8KI0XMgH78opWH6vmH5";
const PHOTO_LOG_SPREADSHEET_ID = "1UJaF7Cquad43ppfuO1zMJcRBZOtnmZQItbFQoxFng5c";
const REGION = "asia-southeast1";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_UID_ATTEMPTS = 8;
const MAX_IP_ATTEMPTS = 400; // Shared venue Wi-Fi: many guests may use one public IP.

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
function requireGuest(request) {
  requireUser(request);
  if (request.auth.token.firebase?.sign_in_provider !== "anonymous")
    throw new HttpsError("permission-denied", "A guest camera session is required.");
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
    photoLimit: Number(v.photoLimit || 50),
    photosUsed: Number(v.photosUsed || 0),
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

function driveConfiguration(options = {}) {
  return configuration({
    timeoutSeconds: 60,
    maxInstances: 10,
    secrets: [DRIVE_OAUTH_SECRET],
    ...options,
  }, false);
}

function driveOAuthClient() {
  let config;
  try {
    config = JSON.parse(DRIVE_OAUTH_SECRET.value());
  } catch {
    throw new HttpsError("failed-precondition", "Google Drive OAuth is not configured.");
  }
  const { clientId, clientSecret, refreshToken } = config || {};
  if (!clientId || !clientSecret || !refreshToken)
    throw new HttpsError("failed-precondition", "Google Drive OAuth is incomplete.");
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return auth;
}

function driveServices() {
  const auth = driveOAuthClient();
  return {
    auth,
    drive: google.drive({ version: "v3", auth }),
    sheets: google.sheets({ version: "v4", auth }),
  };
}

function positiveInt(value, label, max = 20 * 1024 * 1024) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max)
    throw new HttpsError("invalid-argument", "Choose a valid " + label + ".");
  return number;
}

function captureMeta(data = {}) {
  return {
    orientation: enumField(data.orientation, ["portrait","landscape"], "orientation", "portrait"),
    effect: optionalText(data.effect || "natural", 40) || "natural",
    camera: enumField(data.camera, ["front","back"], "camera", "back"),
    clientCapturedAt: optionalText(data.clientCapturedAt, 50),
  };
}

async function oauthAccessToken(auth) {
  const tokenResult = await auth.getAccessToken();
  const token = typeof tokenResult === "string" ? tokenResult : tokenResult?.token;
  if (!token) throw new HttpsError("internal", "Google Drive authorization could not be refreshed.");
  return token;
}

async function createResumableDriveUpload(auth, {
  folderId, fileName, bytes, uploadId, invitationId, sessionUid, variant
}) {
  const token = await oauthAccessToken(auth);
  const fields = encodeURIComponent("id,name,size,parents,appProperties,webViewLink,mimeType,trashed");
  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=" + fields,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "image/jpeg",
        "X-Upload-Content-Length": String(bytes),
      },
      body: JSON.stringify({
        name: fileName,
        parents: [folderId],
        mimeType: "image/jpeg",
        appProperties: {
          wedding: "Angela-Joseph-2027",
          uploadId,
          invitationId,
          sessionUid,
          variant,
        },
      }),
    }
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Drive resumable initiation failed", response.status, detail);
    throw new HttpsError("internal", "Could not prepare Google Drive upload.");
  }
  const uploadUrl = response.headers.get("location");
  if (!uploadUrl) throw new HttpsError("internal", "Google Drive did not return an upload session.");
  return uploadUrl;
}

async function verifiedDriveFile(drive, fileId, expected) {
  const response = await drive.files.get({
    fileId,
    fields: "id,name,size,parents,appProperties,webViewLink,mimeType,trashed",
  });
  const file = response.data;
  const props = file.appProperties || {};
  if (
    file.trashed ||
    file.mimeType !== "image/jpeg" ||
    !Array.isArray(file.parents) ||
    !file.parents.includes(expected.folderId) ||
    props.uploadId !== expected.uploadId ||
    props.invitationId !== expected.invitationId ||
    props.sessionUid !== expected.sessionUid ||
    props.variant !== expected.variant
  ) {
    throw new HttpsError("permission-denied", "Uploaded file verification failed.");
  }
  return file;
}

async function safeDeleteDriveFile(drive, fileId) {
  if (!fileId) return;
  try { await drive.files.delete({ fileId }); }
  catch (error) { console.warn("Could not clean up Drive file", fileId, error?.message); }
}

async function appendPhotoLog(sheets, row) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: PHOTO_LOG_SPREADSHEET_ID,
    range: "'Photo Log'!A:S",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
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
      confirmedSeats: 0,
      photoLimit: 50,
      photosUsed: 0,
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
    const oldSeats = Number(existing.get("confirmedSeats") || 0);
    tx.update(ref, {
      ...values,
      confirmedSeats: values.rsvp === "Yes"
        ? Math.min(values.invitedSeats, oldSeats || values.invitedSeats)
        : 0,
      updatedAt: FieldValue.serverTimestamp(),
    });
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
  requireGuest(request);
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
      photoLimit: Number(activeSnap.get("photoLimit") || 50),
      photosUsed: Number(activeSnap.get("photosUsed") || 0),
    };
  });
  return {
    verified: true,
    cameraOpen: window.cameraOpen,
    invitation: result,
    photoLimit: result.photoLimit,
    photosUsed: result.photosUsed,
    photosRemaining: Math.max(0, result.photoLimit - result.photosUsed),
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
  const photoLimit = Number(invitation.get("photoLimit") || 50);
  const photosUsed = Number(invitation.get("photosUsed") || 0);
  return {
    invitationId: invitation.id,
    revision: Number(invitation.get("revision")),
    partyLabel: invitation.get("partyLabel") || "",
    photoLimit,
    photosUsed,
    photosRemaining: Math.max(0, photoLimit - photosUsed),
  };
}
exports.checkGuestSession = onCall(configuration({}, false), async request => {
  requireGuest(request);
  const session = await activeGuestSession(request.auth.uid);
  const window = await eventWindow();
  return {
    valid: true,
    cameraOpen: window.cameraOpen,
    openAt: window.start.toDate().toISOString(),
    closeAt: window.end.toDate().toISOString(),
    ...session,
  };
});


/**
 * Prepare two direct-to-Drive resumable uploads. The guest never receives the
 * Google OAuth access token; only short-lived resumable session URLs.
 */
exports.beginGuestPhotoUpload = onCall(driveConfiguration(), async request => {
  requireGuest(request);
  const session = await activeGuestSession(request.auth.uid);
  const window = await eventWindow();
  if (!window.cameraOpen)
    throw new HttpsError("failed-precondition", "The wedding camera is closed.");

  if (session.photosRemaining <= 0)
    throw new HttpsError("resource-exhausted", "This invitation's 50-photo film roll is full.");

  const rawBytes = positiveInt(request.data?.rawBytes, "RAW photo size");
  const watermarkedBytes = positiveInt(request.data?.watermarkedBytes, "watermarked photo size");
  const meta = captureMeta(request.data || {});
  const uploadId = randomBytes(12).toString("hex");
  const suffix = uploadId.slice(-10);
  const rawName = "AJ_" + session.invitationId + "_" + suffix + "_RAW.jpg";
  const watermarkedName = "AJ_" + session.invitationId + "_" + suffix + "_WATERMARKED.jpg";
  const capturedAtIso = meta.clientCapturedAt && !Number.isNaN(Date.parse(meta.clientCapturedAt))
    ? new Date(meta.clientCapturedAt).toISOString()
    : new Date().toISOString();

  const pendingRef = db.collection("pendingPhotoUploads").doc(uploadId);
  await pendingRef.create({
    uploadId,
    sessionUid: request.auth.uid,
    invitationId: session.invitationId,
    revision: session.revision,
    partyLabel: session.partyLabel,
    rawBytes,
    watermarkedBytes,
    ...meta,
    capturedAtIso,
    status: "uploading",
    createdAt: FieldValue.serverTimestamp(),
    expireAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
  });

  try {
    const { auth } = driveServices();
    const rawUploadUrl = await createResumableDriveUpload(auth, {
      folderId: DRIVE_RAW_FOLDER_ID,
      fileName: rawName,
      bytes: rawBytes,
      uploadId,
      invitationId: session.invitationId,
      sessionUid: request.auth.uid,
      variant: "raw",
    });
    const watermarkedUploadUrl = await createResumableDriveUpload(auth, {
      folderId: DRIVE_WATERMARKED_FOLDER_ID,
      fileName: watermarkedName,
      bytes: watermarkedBytes,
      uploadId,
      invitationId: session.invitationId,
      sessionUid: request.auth.uid,
      variant: "watermarked",
    });

    return {
      uploadId,
      raw: { uploadUrl: rawUploadUrl, fileName: rawName },
      watermarked: { uploadUrl: watermarkedUploadUrl, fileName: watermarkedName },
      photosRemaining: session.photosRemaining,
    };
  } catch (error) {
    await pendingRef.delete().catch(() => {});
    throw error;
  }
});

/**
 * Verify the uploaded Drive files, atomically consume one invitation frame,
 * then append a read-only audit row to the Google Sheet.
 */
exports.finalizeGuestPhotoUpload = onCall(driveConfiguration(), async request => {
  requireGuest(request);
  const uploadId = String(request.data?.uploadId || "").trim();
  if (!/^[a-f0-9]{24}$/.test(uploadId))
    throw new HttpsError("invalid-argument", "Invalid photo upload.");

  const rawFileId = idField(request.data?.rawFileId, "RAW file");
  const watermarkedFileId = idField(request.data?.watermarkedFileId, "watermarked file");
  const pendingRef = db.collection("pendingPhotoUploads").doc(uploadId);
  const pendingSnap = await pendingRef.get();
  if (!pendingSnap.exists)
    throw new HttpsError("not-found", "This photo upload session is no longer available.");
  const pending = pendingSnap.data();

  if (pending.sessionUid !== request.auth.uid)
    throw new HttpsError("permission-denied", "This photo upload belongs to another session.");

  const session = await activeGuestSession(request.auth.uid);
  if (session.invitationId !== pending.invitationId || session.revision !== Number(pending.revision))
    throw new HttpsError("permission-denied", "The invitation changed before this photo finished uploading.");

  const { drive, sheets } = driveServices();
  const [rawFile, watermarkedFile] = await Promise.all([
    verifiedDriveFile(drive, rawFileId, {
      folderId: DRIVE_RAW_FOLDER_ID,
      uploadId,
      invitationId: pending.invitationId,
      sessionUid: request.auth.uid,
      variant: "raw",
    }),
    verifiedDriveFile(drive, watermarkedFileId, {
      folderId: DRIVE_WATERMARKED_FOLDER_ID,
      uploadId,
      invitationId: pending.invitationId,
      sessionUid: request.auth.uid,
      variant: "watermarked",
    }),
  ]);

  const uploadRef = db.collection("photoUploads").doc(uploadId);
  let result;
  try {
    result = await db.runTransaction(async tx => {
      const existing = await tx.get(uploadRef);
      if (existing.exists) {
        const data = existing.data();
        if (data.sessionUid !== request.auth.uid)
          throw new HttpsError("permission-denied", "This upload belongs to another guest session.");
        return {
          frameNumber: Number(data.frameNumber || 0),
          photosUsed: Number(data.photosUsedAfter || 0),
          photoLimit: Number(data.photoLimit || 50),
          alreadyFinalized: true,
        };
      }

      const invitationRef = db.collection("invitationRegistry").doc(pending.invitationId);
      const invitation = await tx.get(invitationRef);
      if (
        !invitation.exists ||
        invitation.get("status") !== "active" ||
        Number(invitation.get("revision")) !== Number(pending.revision)
      ) {
        throw new HttpsError("permission-denied", "This invitation was replaced or revoked.");
      }

      const photoLimit = Number(invitation.get("photoLimit") || 50);
      const photosUsed = Number(invitation.get("photosUsed") || 0);
      if (photosUsed >= photoLimit)
        throw new HttpsError("resource-exhausted", "This invitation's photo limit has been reached.");

      const frameNumber = photosUsed + 1;
      tx.update(invitationRef, {
        photosUsed: frameNumber,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(uploadRef, {
        uploadId,
        invitationId: pending.invitationId,
        revision: Number(pending.revision),
        sessionUid: request.auth.uid,
        partyLabel: pending.partyLabel || "",
        frameNumber,
        orientation: pending.orientation || "portrait",
        effect: pending.effect || "natural",
        camera: pending.camera || "back",
        capturedAtIso: pending.capturedAtIso || new Date().toISOString(),
        rawFileId,
        rawFileUrl: rawFile.webViewLink || "",
        rawBytes: Number(rawFile.size || pending.rawBytes || 0),
        watermarkedFileId,
        watermarkedFileUrl: watermarkedFile.webViewLink || "",
        watermarkedBytes: Number(watermarkedFile.size || pending.watermarkedBytes || 0),
        photoLimit,
        photosUsedAfter: frameNumber,
        sheetLogged: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(pendingRef, {
        status: "finalized",
        finalizedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return { frameNumber, photosUsed: frameNumber, photoLimit, alreadyFinalized: false };
    });
  } catch (error) {
    if (error?.code === "resource-exhausted") {
      await Promise.all([
        safeDeleteDriveFile(drive, rawFileId),
        safeDeleteDriveFile(drive, watermarkedFileId),
      ]);
    }
    throw error;
  }

  const photosRemaining = Math.max(0, result.photoLimit - result.photosUsed);
  if (!result.alreadyFinalized) {
    const row = [
      pending.capturedAtIso || new Date().toISOString(),
      uploadId,
      pending.invitationId,
      pending.partyLabel || "",
      result.frameNumber,
      pending.orientation || "portrait",
      pending.effect || "natural",
      pending.camera || "back",
      request.auth.uid,
      rawFileId,
      rawFile.webViewLink || "",
      Number(rawFile.size || pending.rawBytes || 0),
      "Uploaded",
      "Uploaded",
      watermarkedFileId,
      watermarkedFile.webViewLink || "",
      Number(watermarkedFile.size || pending.watermarkedBytes || 0),
      "Uploaded",
      "",
    ];

    try {
      await appendPhotoLog(sheets, row);
      await uploadRef.set({ sheetLogged: true, sheetLoggedAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      console.error("Photo uploaded but Sheet log append failed", uploadId, error);
      await uploadRef.set({
        sheetLogged: false,
        sheetLogError: optionalText(error?.message || "Sheet log failed", 500),
      }, { merge: true });
    }
  }

  return {
    ok: true,
    uploadId,
    frameNumber: result.frameNumber,
    photosUsed: result.photosUsed,
    photosRemaining,
    photoLimit: result.photoLimit,
    rawFileId,
    watermarkedFileId,
  };
});

/**
 * Best-effort cleanup when one of the browser-to-Drive PUTs fails.
 */
exports.cancelGuestPhotoUpload = onCall(driveConfiguration(), async request => {
  requireGuest(request);
  const uploadId = String(request.data?.uploadId || "").trim();
  if (!/^[a-f0-9]{24}$/.test(uploadId))
    throw new HttpsError("invalid-argument", "Invalid photo upload.");

  const pendingRef = db.collection("pendingPhotoUploads").doc(uploadId);
  const pendingSnap = await pendingRef.get();
  if (!pendingSnap.exists) return { ok: true };
  const pending = pendingSnap.data();
  if (pending.sessionUid !== request.auth.uid)
    throw new HttpsError("permission-denied", "This upload belongs to another session.");

  const { drive } = driveServices();
  const candidates = [
    { id: optionalText(request.data?.rawFileId, 150), folderId: DRIVE_RAW_FOLDER_ID, variant: "raw" },
    { id: optionalText(request.data?.watermarkedFileId, 150), folderId: DRIVE_WATERMARKED_FOLDER_ID, variant: "watermarked" },
  ];

  for (const item of candidates) {
    if (!item.id) continue;
    try {
      await verifiedDriveFile(drive, item.id, {
        folderId: item.folderId,
        uploadId,
        invitationId: pending.invitationId,
        sessionUid: request.auth.uid,
        variant: item.variant,
      });
      await safeDeleteDriveFile(drive, item.id);
    } catch (error) {
      console.warn("Skipped upload cleanup", item.id, error?.message);
    }
  }

  await pendingRef.set({
    status: "cancelled",
    cancelledAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true };
});

/**
 * Organizer diagnostic used by Wedding Studio to confirm that the OAuth token,
 * Drive folders, and tracking Sheet are reachable.
 */
exports.driveStorageStatus = onCall(driveConfiguration({ maxInstances: 3 }), async request => {
  requireAdmin(request);
  const { drive, sheets } = driveServices();
  const [parent, raw, watermarked, sheet] = await Promise.all([
    drive.files.get({ fileId: DRIVE_PARENT_FOLDER_ID, fields: "id,name,webViewLink,mimeType,trashed" }),
    drive.files.get({ fileId: DRIVE_RAW_FOLDER_ID, fields: "id,name,webViewLink,mimeType,trashed" }),
    drive.files.get({ fileId: DRIVE_WATERMARKED_FOLDER_ID, fields: "id,name,webViewLink,mimeType,trashed" }),
    sheets.spreadsheets.get({
      spreadsheetId: PHOTO_LOG_SPREADSHEET_ID,
      fields: "spreadsheetId,spreadsheetUrl,properties.title",
    }),
  ]);

  return {
    connected: true,
    parent: parent.data,
    raw: raw.data,
    watermarked: watermarked.data,
    sheet: sheet.data,
  };
});


/**
 * RSVP by invitation holder, without registration.
 * The transaction reads the session and CURRENT invitation revision, so old
 * sessions cannot edit RSVPs after a code is rotated or revoked.
 */
exports.respondToInvitation = onCall(configuration({}, false), async request => {
  requireGuest(request);
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
