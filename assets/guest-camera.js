import { guestAccessConfig } from "./guest-config.js?v=20261031-2330";
import { getGuestClient, callGuestFunction } from "./firebase-services.js?v=20261031-2330";

const form = document.getElementById("invitation-form");
const input = document.getElementById("invitation-code");
const feedback = document.getElementById("invitation-status");
const submit = document.getElementById("check-invitation");
const gate = document.getElementById("camera-gate-wrap");
const cameraSession = document.getElementById("camera-session");
const cameraButton = document.getElementById("start-camera");
const changeCodeButton = document.getElementById("camera-change-code");
const partyLabel = document.getElementById("camera-session-party");
const quotaLabel = document.getElementById("camera-session-quota");
const cameraMessage = document.getElementById("camera-message");
const codeModal = document.getElementById("camera-code-modal");
const codeModalClose = document.getElementById("camera-code-close");
const switchForm = document.getElementById("camera-code-switch-form");
const switchInput = document.getElementById("camera-code-switch-input");
const switchStatus = document.getElementById("camera-code-switch-status");
const invitationLanding=document.getElementById("guest-invitation-landing");
const landingContinue=document.getElementById("guest-invitation-continue");
const landingAnotherCode=document.getElementById("guest-invitation-enter-code");
const landingCode=document.getElementById("guest-invitation-code");
const landingMode=document.getElementById("guest-invitation-mode");
const landingDate=document.getElementById("guest-invitation-date");
const landingStatus=document.getElementById("guest-invitation-status");

const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
const normalize = value =>
  String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
const formatted = code =>
  code.length > 4 ? code.slice(0, 4) + "-" + code.slice(4) : code;

let authApi = null;
let pendingLinkCode = null;
let sessionRestoring = false;
let cameraAccess = null;
let photoUploadQueue = Promise.resolve();
let guestPollTimer = null;
let guestPollBusy = false;
const cameraRequested = () => location.hash === "#camera" || location.hash.startsWith("#camera/");
const secureGuestEnabled = guestAccessConfig.enabled;

function driveUploadsActive() {
  return Boolean(
    secureGuestEnabled && guestAccessConfig.driveUploadsEnabled &&
    cameraAccess?.cameraOpen === true
  );
}

async function uploadBlobToDrive(uploadUrl, blob) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "image/jpeg",
    },
    body: blob,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("Drive upload failed (" + response.status + ")" + (detail ? ": " + detail.slice(0,160) : ""));
  }
  const data = await response.json();
  if (!data?.id) throw new Error("Drive did not return the uploaded file ID.");
  return data;
}

async function callUploadFunction(name, data) {
  const fn = callGuestFunction(name);
  const response = await fn(data);
  return response.data;
}

async function uploadCapturedPhoto(detail) {
  if (!driveUploadsActive()) return null;
  if (!(detail?.rawBlob instanceof Blob) || !(detail?.blob instanceof Blob)) {
    throw new Error("Captured photo data is unavailable.");
  }

  const loader = window.WeddingUI?.begin(
    "Saving this memory…",
    "Preparing private Google Drive upload.",
    { blocking: false, delay: 180 }
  );
  let uploadId = "";
  let rawFileId = "";
  let watermarkedFileId = "";

  try {
    const begin = await callUploadFunction(guestAccessConfig.beginPhotoUploadCallable, {
      rawBytes: detail.rawBlob.size,
      watermarkedBytes: detail.blob.size,
      orientation: detail.orientation || "portrait",
      effect: detail.filter || "natural",
      camera: detail.facingMode === "user" ? "front" : "back",
      clientCapturedAt: new Date().toISOString(),
    });
    uploadId = begin.uploadId;

    window.WeddingUI?.update(loader, "Uploading clean original…", "RAW copy → private wedding Drive.");
    const raw = await uploadBlobToDrive(begin.raw.uploadUrl, detail.rawBlob);
    rawFileId = raw.id;

    window.WeddingUI?.update(loader, "Uploading wedding copy…", "Filtered and watermarked copy → private wedding Drive.");
    const watermarked = await uploadBlobToDrive(begin.watermarked.uploadUrl, detail.blob);
    watermarkedFileId = watermarked.id;

    window.WeddingUI?.update(loader, "Finalizing memory…", "Updating the invitation counter and protected photo log.");
    const finalized = await callUploadFunction(guestAccessConfig.finalizePhotoUploadCallable, {
      uploadId,
      rawFileId,
      watermarkedFileId,
    });

    if (cameraAccess) {
      cameraAccess.photosUsed = Number(finalized.photosUsed || cameraAccess.photosUsed || 0);
      cameraAccess.photosRemaining = Number(finalized.photosRemaining ?? cameraAccess.photosRemaining ?? 0);
    }
    if (cameraMessage) {
      cameraMessage.textContent =
        "Memory saved privately · " + finalized.photosRemaining + " frames left";
    }
    document.dispatchEvent(new CustomEvent("wedding:photo-uploaded", {
      detail:{...finalized,localSequence:detail.localSequence}
    }));
    return finalized;
  } catch (error) {
    console.error("Wedding photo upload failed", error);
    if (uploadId) {
      callUploadFunction(guestAccessConfig.cancelPhotoUploadCallable, {
        uploadId,
        rawFileId,
        watermarkedFileId,
      }).catch(cancelError => console.warn("Upload cleanup failed", cancelError));
    }
    if (cameraMessage) {
      cameraMessage.textContent =
        "Upload failed. This photo was not saved to Drive. Please retry.";
    }
    document.dispatchEvent(new CustomEvent("wedding:photo-upload-failed", {
      detail: { localSequence: detail?.localSequence || 0, message: error?.message || "Upload failed" }
    }));
    throw error;
  } finally {
    if (loader) window.WeddingUI?.end(loader);
  }
}

function queueCapturedPhoto(detail) {
  photoUploadQueue = photoUploadQueue
    .catch(() => {})
    .then(() => uploadCapturedPhoto(detail));
  return photoUploadQueue;
}

function show(message, state = "") {
  feedback.textContent = message;
  feedback.className = "invitation-status" + (state ? " is-" + state : "");
}

function quotaText(data) {
  const limit = Math.max(1, Number(data.photoLimit || 50));
  const used = Math.max(0, Number(data.photosUsed || 0));
  const remaining = Math.max(0, Number(
    data.photosRemaining !== undefined ? data.photosRemaining : limit - used
  ));
  return remaining + " left";
}

function closeCodeModal() {
  if (!codeModal) return;
  codeModal.hidden = true;
  switchStatus.textContent = "";
  switchInput.value = "";
}

function openCodeModal() {
  if (!codeModal) return;
  codeModal.hidden = false;
  switchStatus.textContent = "";
  switchInput.value = "";
  requestAnimationFrame(() => switchInput.focus());
}

function modalShow(message, state = "") {
  switchStatus.textContent = message;
  switchStatus.className = "camera-code-switch-status" + (state ? " is-" + state : "");
}

async function refreshSharedFilm() {
  if (!secureGuestEnabled || cameraSession.hidden || document.hidden || guestPollBusy) return;
  guestPollBusy=true;
  try {
    const result=await checkRememberedSession();
    if (!result?.valid) return;

    if (cameraAccess) {
      cameraAccess.cameraOpen=result.cameraOpen === true;
      cameraAccess.photosUsed=Math.max(Number(cameraAccess.photosUsed || 0),Number(result.photosUsed || 0));
      cameraAccess.photosRemaining=Math.max(0,Number(result.photosRemaining || 0));
    }
    document.dispatchEvent(new CustomEvent("wedding:photo-synced",{detail:result}));
    if (!result.cameraOpen) {
      if(cameraMessage)cameraMessage.textContent="Camera access has been closed by the organizer.";
      leaveCameraMode();
      show("Your invitation is still valid, but camera access is closed.");
    }
  } catch(error) {
    if (String(error?.code || "").includes("permission-denied")) {
      cameraMessage.textContent="This camera pass was revoked or expired.";
      leaveCameraMode();
    }
  } finally {
    guestPollBusy=false;
  }
}
function startSharedFilmPolling() {
  if (guestPollTimer) clearInterval(guestPollTimer);
  if (!secureGuestEnabled) return;
  guestPollTimer=setInterval(refreshSharedFilm,15000);
}
function stopSharedFilmPolling() {
  if(guestPollTimer) clearInterval(guestPollTimer);
  guestPollTimer=null;
}

function enterCameraMode(data = {}) {
  cameraAccess = data;
  hideInvitationLanding();
  closeCodeModal();
  startSharedFilmPolling();
  gate.hidden = true;
  cameraSession.hidden = false;
  cameraSession.removeAttribute("aria-hidden");
  document.body.classList.add("camera-session-active");
  partyLabel.textContent = data.partyLabel || data.invitation?.partyLabel || "Invitation verified";
  quotaLabel.textContent = quotaText(data);
  cameraSession.dataset.photoLimit = String(Math.max(1, Number(data.photoLimit || 50)));
  cameraSession.dataset.liveUploads = String(driveUploadsActive());
  const fineprint=document.getElementById("camera-fineprint");
  if(fineprint) fineprint.textContent=driveUploadsActive()
    ? "Photos upload privately to Drive. Only confirmed uploads use a frame."
    : "Camera access is closed. Ask an organizer to enable this invitation.";
  cameraSession.dataset.photosUsed = String(Math.max(0, Number(data.photosUsed || 0)));
  cameraButton.disabled = !data.cameraOpen;
  cameraButton.setAttribute("aria-disabled", String(!data.cameraOpen));
  document.dispatchEvent(new CustomEvent("wedding:camera-mode", {
    detail: {
      active: true,
      partyLabel: data.partyLabel || data.invitation?.partyLabel || "",
      photoLimit: Math.max(1, Number(data.photoLimit || 50)),
      photosUsed: Math.max(0, Number(data.photosUsed || 0)),
      accessCode: data.accessCode || "",
      photosRemaining: Math.max(0, Number(
        data.photosRemaining !== undefined
          ? data.photosRemaining
          : Math.max(1, Number(data.photoLimit || 50)) - Math.max(0, Number(data.photosUsed || 0))
      ))
    }
  }));
}

function leaveCameraMode({ focusCode = false } = {}) {
  stopSharedFilmPolling();
  cameraAccess=null;
  cameraSession.hidden = true;
  cameraSession.setAttribute("aria-hidden", "true");
  gate.hidden = false;
  document.body.classList.remove("camera-session-active");
  document.dispatchEvent(new CustomEvent("wedding:camera-mode", {
    detail: { active: false }
  }));
  if (focusCode) {
    input.value = "";
    show("Enter another invitation code to switch camera access.");
    requestAnimationFrame(() => input.focus());
  }
}

async function authTools() {
  if (authApi) return authApi;
  authApi = await import("https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js");
  return authApi;
}

async function prepareGuestAuth() {
  const { auth } = getGuestClient();
  const tools = await authTools();
  await tools.setPersistence(auth, tools.browserLocalPersistence);
  return { auth, tools };
}

async function guestUser({ create = false } = {}) {
  const { auth, tools } = await prepareGuestAuth();
  if (!auth.currentUser && create) await tools.signInAnonymously(auth);
  return auth.currentUser;
}

async function redeem(code) {
  const user = await guestUser({ create: true });
  if (!user || !user.isAnonymous) throw new Error("Guest camera session unavailable.");
  const fn = callGuestFunction(guestAccessConfig.callableName);
  const response = await fn({ code });
  return response.data;
}

async function checkRememberedSession() {
  const user = await guestUser({ create: false });
  if (!user || !user.isAnonymous || !secureGuestEnabled) return null;
  const fn = callGuestFunction("checkGuestSession");
  const response = await fn({});
  return response.data;
}

function updateLandingDate() {
  if (!landingDate) return;
  const current=document.getElementById("wedding-big-day")?.textContent?.trim();
  landingDate.textContent=current || "December 23, 2027";
  const configured=document.getElementById("wedding-venue-fact")?.textContent?.trim();
  const venue=document.getElementById("guest-invitation-venue");
  if(venue) venue.textContent=configured && configured!=="Venue to be confirmed"
    ? configured+" · Tentative venue" : "Venue to be confirmed";
}
function showInvitationLanding(code) {
  if (!CODE_PATTERN.test(code) || !invitationLanding) return;
  pendingLinkCode=code;
  input.value=formatted(code);
  landingCode.textContent=formatted(code);
  const recipient=document.getElementById("guest-invitation-recipient");
  if(recipient)recipient.textContent="For our invited guests";
  updateLandingDate();
  landingMode.textContent="YOU'RE INVITED";
  landingStatus.textContent="Checking your invitation details securely…";
  invitationLanding.hidden=false;
  gate.classList.add("has-invitation");
  // The link itself is a bearer credential. Fetch only the named party and
  // seat count after anonymous auth + App Check; do not show private records.
  guestUser({create:true})
    .then(()=>callGuestFunction("getInvitationDetails")({code}))
    .then(response=>{
      if(pendingLinkCode!==code)return;
      const recipient=document.getElementById("guest-invitation-recipient");
      if(recipient && response.data?.partyLabel)
        recipient.textContent="For: "+response.data.partyLabel;
      landingStatus.textContent="Invitation for "+Number(response.data?.invitedSeats||1)+
        " allotted seat(s). Open your camera when you're ready.";
    })
    .catch(error=>{
      if(pendingLinkCode===code)landingStatus.textContent=
        "Invitation details aren't available yet. You can still try to verify the code.";
      console.warn("Could not load invitation details:",error?.code||error);
    });
}
function hideInvitationLanding() {
  if(invitationLanding)invitationLanding.hidden=true;
  gate.classList.remove("has-invitation");
  pendingLinkCode=null;
}
function absorbInvitationUrl() {
  const fragment=window.location.hash;
  if (!fragment.startsWith("#camera/")) return null;
  const code=normalize(fragment.slice("#camera/".length));
  // Remove the bearer code from the visible address once it has been read.
  window.history.replaceState(null,"",window.location.pathname+window.location.search+"#camera");
  if (!CODE_PATTERN.test(code)) {
    show("That invitation link has an invalid camera code.","error");
    return null;
  }
  showInvitationLanding(code);
  return code;
}
landingContinue?.addEventListener("click",async()=>{
  const code=pendingLinkCode;
  if(!CODE_PATTERN.test(code||""))return;
  landingContinue.disabled=true;
  landingStatus.textContent="Verifying your invitation…";
  try {
    const result=await verifyCode(code,{fromLink:true});
    if(result)hideInvitationLanding();
    else landingStatus.textContent=feedback.textContent || "Verification not completed.";
  } finally {
    landingContinue.disabled=false;
  }
});
landingAnotherCode?.addEventListener("click",()=>{
  hideInvitationLanding();
  show("Enter a different camera code below.");
  input.focus();
});
document.addEventListener("wedding:public-details",updateLandingDate);

async function verifyCode(code, { fromLink = false, switching = false } = {}) {
  const report = switching ? modalShow : show;
  const focusTarget = switching ? switchInput : input;

  if (!CODE_PATTERN.test(code)) {
    report("Please enter all eight characters from the invitation.", "error");
    focusTarget?.focus();
    return false;
  }

  const switchSubmit = switching ? switchForm?.querySelector('button[type="submit"]') : submit;
  if (switchSubmit) switchSubmit.disabled = true;
  if (!switching) cameraButton.disabled = true;
  const verifyLoader = window.WeddingUI?.begin(
    switching ? "Switching camera pass…" : "Verifying invitation…",
    "Checking secure guest access.",
    { blocking: true, delay: 160 }
  );
  report(
    fromLink ? "Opening your private wedding camera…" :
    switching ? "Switching camera pass…" :
    "Checking your invitation securely…"
  );

  try {
    const verified = await redeem(code);
    if (!verified.cameraOpen) {
      const open = verified.openAt ? new Date(verified.openAt) : null;
      const when = open && !Number.isNaN(open.getTime())
        ? open.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
        : "the wedding-day access window";
      report(verified.openAt
        ? "Invitation verified. The camera opens at " + when + "."
        : "Invitation verified. The organizer has not opened camera access yet.", "ok");
      return false;
    }
    enterCameraMode({
      ...verified,
      partyLabel: verified.invitation?.partyLabel,
      photoLimit: verified.photoLimit,
      photosUsed: verified.photosUsed,
      photosRemaining: verified.photosRemaining,
      accessCode: code
    });
    return true;
  } catch (error) {
    const codeName = String(error?.code || "");
    if (codeName.includes("resource-exhausted")) {
      report("Too many code attempts. Please wait a little or ask a coordinator.", "error");
    } else if (codeName.includes("permission-denied")) {
      report("That code is no longer active. Ask for the latest invitation link or try another code.", "error");
    } else if (codeName.includes("unauthenticated")) {
      report("Your camera session could not be created. Please try again.", "error");
    } else {
      report("Code not recognized, or camera verification is temporarily unavailable.", "error");
    }
    return false;
  } finally {
    if (verifyLoader) window.WeddingUI?.end(verifyLoader);
    if (switchSubmit) switchSubmit.disabled = false;
  }
}

async function restoreOnThisDevice() {
  if (!cameraRequested() || sessionRestoring || pendingLinkCode) return;
  sessionRestoring = true;

  show("Checking whether this phone already has wedding camera access…");
  const restoreLoader = window.WeddingUI?.begin(
    "Restoring camera pass…",
    "Checking the saved invitation session on this device.",
    { blocking: true, delay: 180 }
  );
  try {
    const session = await checkRememberedSession();
    if (!session?.valid) {
      show("Enter your invitation code to open the wedding camera.");
      return;
    }

    if (session.cameraOpen) {
      enterCameraMode(session);
    } else {
      const open = session.openAt ? new Date(session.openAt) : null;
      const when = open && !Number.isNaN(open.getTime())
        ? open.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
        : "the wedding-day access window";
      show(session.openAt
        ? "This phone remembers your invitation. The camera opens at " + when + "."
        : "This phone remembers your invitation. Camera access is currently closed.", "ok");
    }
  } catch (error) {
    const denied = String(error?.code || "").includes("permission-denied");
    if (denied) {
      const { auth, tools } = await prepareGuestAuth();
      await tools.signOut(auth).catch(() => {});
      show("Your saved camera access expired or was replaced. Enter the latest invitation code.", "error");
    } else {
      show("We couldn't restore the saved camera session. You can enter the invitation code again.", "error");
    }
  } finally {
    if (restoreLoader) window.WeddingUI?.end(restoreLoader);
    sessionRestoring = false;
  }
}

input.addEventListener("input", () => {
  const clean = normalize(input.value);
  input.value = formatted(clean);
  try {
    input.setSelectionRange(input.value.length, input.value.length);
  } catch {}
  if (feedback.classList.contains("is-error")) show("");
});

form.addEventListener("submit", event => {
  event.preventDefault();
  verifyCode(normalize(input.value));
});

changeCodeButton.addEventListener("click", openCodeModal);
codeModalClose?.addEventListener("click", closeCodeModal);
codeModal?.addEventListener("click", event => {
  if (event.target === codeModal) closeCodeModal();
});

switchInput?.addEventListener("input", () => {
  const clean = normalize(switchInput.value);
  switchInput.value = formatted(clean);
  try { switchInput.setSelectionRange(switchInput.value.length, switchInput.value.length); } catch {}
  if (switchStatus.classList.contains("is-error")) modalShow("");
});

switchForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const code = normalize(switchInput.value);
  await verifyCode(code, { switching: true });
});

document.addEventListener("wedding:camera-exit-request", () => {
  closeCodeModal();
  if (!cameraSession.hidden) leaveCameraMode();
});

document.addEventListener("visibilitychange",()=>{
  if(!document.hidden)refreshSharedFilm();
});
window.addEventListener("focus",refreshSharedFilm);
document.addEventListener("wedding:photo-captured", event => {
  if (driveUploadsActive()) queueCapturedPhoto(event.detail).catch(() => {});
});

window.addEventListener("hashchange", () => {
  const code = absorbInvitationUrl();
  if (code) return;
  if (cameraRequested() && cameraSession.hidden) restoreOnThisDevice();
});

document.addEventListener("wedding:view-change", event => {
  if (event.detail?.view === "camera" && cameraSession.hidden) restoreOnThisDevice();
});

async function initializeGuestCameraAccess() {
  if (!cameraRequested()) return;
  pendingLinkCode = absorbInvitationUrl();

  try {
    const { auth, tools } = await prepareGuestAuth();
    tools.onAuthStateChanged(auth, () => {
      if (!pendingLinkCode) restoreOnThisDevice();
    });
  } catch {
    show("This browser could not initialize secure camera access. Please try another browser.", "error");
    return;
  }

  if (pendingLinkCode) {
    landingStatus.textContent="Your invitation is ready. Tap Open your wedding camera to continue.";
  }
}

leaveCameraMode();
initializeGuestCameraAccess();
