import { guestAccessConfig } from "./guest-config.js?v=20261031-2245";
import { getGuestClient, callGuestFunction } from "./firebase-services.js?v=20261031-2245";

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
const previewHelper = document.getElementById("camera-preview-helper");
const previewCode = document.getElementById("camera-preview-code");
const useTestCodeButton = document.getElementById("camera-use-test-code");
const codeModal = document.getElementById("camera-code-modal");
const codeModalClose = document.getElementById("camera-code-close");
const switchForm = document.getElementById("camera-code-switch-form");
const switchInput = document.getElementById("camera-code-switch-input");
const switchStatus = document.getElementById("camera-code-switch-status");

const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
const normalize = value =>
  String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
const formatted = code =>
  code.length > 4 ? code.slice(0, 4) + "-" + code.slice(4) : code;

let authApi = null;
let pendingLinkCode = null;
let sessionRestoring = false;
let cameraAccess = null;
const cameraRequested = () => location.hash === "#camera" || location.hash.startsWith("#camera/");
const PREVIEW_SESSION_KEY = "mywedding_camera_preview_session_v1";
const PREVIEW_USAGE_KEY = "mywedding_camera_preview_usage_v1";
const previewTestCode = normalize(guestAccessConfig.previewTestCode || "AJ27-TEST");
const previewTestActive = Boolean(!guestAccessConfig.enabled && guestAccessConfig.previewTestEnabled !== false && CODE_PATTERN.test(previewTestCode));

function previewUsage() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREVIEW_USAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function previewUsed(code) {
  return Math.max(0, Math.min(50, Number(previewUsage()[code] || 0)));
}

function savePreviewUsed(code, used) {
  const data = previewUsage();
  data[code] = Math.max(0, Math.min(50, Number(used || 0)));
  localStorage.setItem(PREVIEW_USAGE_KEY, JSON.stringify(data));
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

function enterCameraMode(data = {}) {
  cameraAccess = data;
  closeCodeModal();
  gate.hidden = true;
  cameraSession.hidden = false;
  cameraSession.removeAttribute("aria-hidden");
  document.body.classList.add("camera-session-active");
  partyLabel.textContent = data.partyLabel || data.invitation?.partyLabel || "Invitation verified";
  quotaLabel.textContent = quotaText(data);
  cameraSession.dataset.photoLimit = String(Math.max(1, Number(data.photoLimit || 50)));
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

async function verifyCode(code, { fromLink = false, switching = false } = {}) {
  const report = switching ? modalShow : show;
  const focusTarget = switching ? switchInput : input;

  if (!CODE_PATTERN.test(code)) {
    report("Please enter all eight characters from the invitation.", "error");
    focusTarget?.focus();
    return false;
  }

  if (!guestAccessConfig.enabled) {
    if (previewTestActive && code === previewTestCode) {
      const used = previewUsed(code);
      localStorage.setItem(PREVIEW_SESSION_KEY, code);
      enterCameraMode({
        verified: true,
        cameraOpen: true,
        partyLabel: "Camera Preview · Test Guest",
        photoLimit: 50,
        photosUsed: used,
        photosRemaining: Math.max(0, 50-used),
        preview: true,
        accessCode: code
      });
      return true;
    }
    report("That preview code is not recognized.", "error");
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
      report("Invitation verified. The camera will open at " + when + ".", "ok");
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

  if (!guestAccessConfig.enabled) {
    const savedCode = normalize(localStorage.getItem(PREVIEW_SESSION_KEY) || "");
    if (previewTestActive && savedCode === previewTestCode) {
      const used = previewUsed(savedCode);
      enterCameraMode({
        verified: true,
        cameraOpen: true,
        partyLabel: "Camera Preview · Test Guest",
        photoLimit: 50,
        photosUsed: used,
        photosRemaining: Math.max(0, 50-used),
        preview: true,
        accessCode: savedCode
      });
    } else {
      show("Preview mode is active. Use the temporary test code below to open the camera.");
    }
    submit.disabled = false;
    sessionRestoring = false;
    return;
  }

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

document.addEventListener("wedding:photo-captured", event => {
  if (!cameraAccess?.preview || !cameraAccess.accessCode) return;
  const usedAtOpen = Math.max(0, Number(cameraAccess.photosUsed || 0));
  const localSequence = Math.max(0, Number(event.detail?.localSequence || 0));
  savePreviewUsed(cameraAccess.accessCode, usedAtOpen + localSequence);
});

window.addEventListener("hashchange", () => {
  const code = absorbInvitationUrl();
  if (code) {
    verifyCode(code, { fromLink: true });
    return;
  }
  if (cameraRequested() && cameraSession.hidden) restoreOnThisDevice();
});

document.addEventListener("wedding:view-change", event => {
  if (event.detail?.view === "camera" && cameraSession.hidden) restoreOnThisDevice();
});

async function initializeGuestCameraAccess() {
  if (!cameraRequested()) return;
  pendingLinkCode = absorbInvitationUrl();

  if (previewTestActive) {
    previewHelper.hidden = false;
    previewCode.textContent = formatted(previewTestCode);
    useTestCodeButton.addEventListener("click", () => {
      input.value = formatted(previewTestCode);
      verifyCode(previewTestCode);
    });
  } else {
    previewHelper.hidden = true;
  }

  if (!guestAccessConfig.enabled) {
    if (pendingLinkCode) {
      const code = pendingLinkCode;
      pendingLinkCode = null;
      await verifyCode(code, { fromLink: true });
    } else {
      await restoreOnThisDevice();
    }
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
