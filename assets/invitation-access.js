import { guestAccessConfig } from "./guest-config.js?v=20261031-1830";
import { getGuestClient, callGuestFunction } from "./firebase-services.js?v=20261031-1830";

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

const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
const normalize = value =>
  String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
const formatted = code =>
  code.length > 4 ? code.slice(0, 4) + "-" + code.slice(4) : code;

let authApi = null;
let pendingLinkCode = null;
let sessionRestoring = false;
let cameraAccess = null;

function show(message, state = "") {
  feedback.textContent = message;
  feedback.className = "invitation-status" + (state ? " is-" + state : "");
}

function quotaText(data) {
  const limit = Math.max(1, Number(data.photoLimit || 40));
  const used = Math.max(0, Number(data.photosUsed || 0));
  const remaining = Math.max(0, Number(
    data.photosRemaining !== undefined ? data.photosRemaining : limit - used
  ));
  return remaining + " of " + limit + " memories available";
}

function enterCameraMode(data = {}) {
  cameraAccess = data;
  gate.hidden = true;
  cameraSession.hidden = false;
  cameraSession.removeAttribute("aria-hidden");
  document.body.classList.add("camera-session-active");
  partyLabel.textContent = data.partyLabel || data.invitation?.partyLabel || "Invitation verified";
  quotaLabel.textContent = quotaText(data);
  cameraButton.disabled = !data.cameraOpen;
  cameraButton.setAttribute("aria-disabled", String(!data.cameraOpen));
  document.dispatchEvent(new CustomEvent("wedding:camera-mode", {
    detail: { active: true }
  }));
}

function leaveCameraMode({ focusCode = false } = {}) {
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
  if (!user || !user.isAnonymous || !guestAccessConfig.enabled) return null;
  const fn = callGuestFunction("checkGuestSession");
  const response = await fn({});
  return response.data;
}

function absorbInvitationUrl() {
  const fragment = window.location.hash;
  if (!fragment.startsWith("#camera/")) return null;
  const code = normalize(fragment.slice("#camera/".length));
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search + "#camera"
  );
  if (!CODE_PATTERN.test(code)) {
    show("That invitation link does not contain a valid camera code.", "error");
    return null;
  }
  input.value = formatted(code);
  return code;
}

async function verifyCode(code, { fromLink = false } = {}) {
  if (!CODE_PATTERN.test(code)) {
    show("Please enter all eight characters from your invitation.", "error");
    input.focus();
    return;
  }

  if (!guestAccessConfig.enabled) {
    show("The secure wedding camera is not activated yet. The invitation backend still needs to be deployed.", "error");
    return;
  }

  submit.disabled = true;
  cameraButton.disabled = true;
  show(fromLink ? "Opening your private wedding camera…" : "Checking your invitation securely…");

  try {
    const verified = await redeem(code);
    if (!verified.cameraOpen) {
      const open = verified.openAt ? new Date(verified.openAt) : null;
      const when = open && !Number.isNaN(open.getTime())
        ? open.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
        : "the wedding-day access window";
      show("Invitation verified. The camera will open at " + when + ".", "ok");
      return;
    }
    enterCameraMode({
      ...verified,
      partyLabel: verified.invitation?.partyLabel,
      photoLimit: verified.photoLimit,
      photosUsed: verified.photosUsed,
      photosRemaining: verified.photosRemaining
    });
  } catch (error) {
    const codeName = String(error?.code || "");
    if (codeName.includes("resource-exhausted")) {
      show("Too many code attempts. Please wait a little or ask a coordinator.", "error");
    } else if (codeName.includes("permission-denied")) {
      show("That code is no longer active. Ask for the latest invitation link or try another code.", "error");
    } else if (codeName.includes("unauthenticated")) {
      show("Your camera session could not be created. Please try again.", "error");
    } else {
      show("Code not recognized, or camera verification is temporarily unavailable.", "error");
    }
  } finally {
    submit.disabled = false;
  }
}

async function restoreOnThisDevice() {
  if (sessionRestoring || pendingLinkCode) return;
  sessionRestoring = true;

  if (!guestAccessConfig.enabled) {
    show("Wedding camera access is not active yet. Entering codes will be enabled after the secure backend is deployed.");
    submit.disabled = false;
    sessionRestoring = false;
    return;
  }

  show("Checking whether this phone already has wedding camera access…");
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
      show("This phone remembers your invitation. The camera opens at " + when + ".", "ok");
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

changeCodeButton.addEventListener("click", () => {
  leaveCameraMode({ focusCode: true });
});

document.addEventListener("wedding:camera-exit-request", () => {
  if (!cameraSession.hidden) leaveCameraMode();
});

window.addEventListener("hashchange", () => {
  const code = absorbInvitationUrl();
  if (code) verifyCode(code, { fromLink: true });
});

async function initializeGuestCameraAccess() {
  pendingLinkCode = absorbInvitationUrl();

  if (!guestAccessConfig.enabled) {
    show("Wedding camera access is not active yet. The camera itself stays hidden until secure invitation verification is deployed.");
    return;
  }

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
    const code = pendingLinkCode;
    pendingLinkCode = null;
    await verifyCode(code, { fromLink: true });
  }
}

leaveCameraMode();
initializeGuestCameraAccess();
