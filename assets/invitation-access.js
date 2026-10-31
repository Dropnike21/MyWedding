import { guestAccessConfig } from "./guest-config.js";

const form = document.getElementById("invitation-form");
const input = document.getElementById("invitation-code");
const feedback = document.getElementById("invitation-status");
const submit = document.getElementById("check-invitation");

const CODE_ALPHABET = /^[A-HJ-NP-Z2-9]{8}$/; // Excludes 0, 1, I and O
const normalize = (text) =>
  String(text || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

function show(message, state = "") {
  feedback.textContent = message;
  feedback.className = "invitation-status" + (state ? " is-" + state : "");
}

function formatted(code) {
  return code.length > 4 ? code.slice(0, 4) + "-" + code.slice(4) : code;
}

function absorbInvitationUrl() {
  // URL fragment is not sent to GitHub Pages or HTTP servers.
  // Example: https://dropnike21.github.io/MyWedding/#camera/ABCD-EFGH
  const fragment = window.location.hash;
  if (!fragment.startsWith("#camera/")) return;
  const encoded = fragment.slice("#camera/".length);
  const code = normalize(encoded);
  if (!CODE_ALPHABET.test(code)) {
    show("That invitation link does not contain a valid code.", "error");
  } else {
    input.value = formatted(code);
    show(
      guestAccessConfig.enabled
        ? "Your invitation code is ready. Select Continue."
        : "Your invitation code is filled in. Verification isn't active yet."
    );
  }
  // Remove secret from browser address bar/history as soon as it's extracted.
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search + "#camera"
  );
}

input.addEventListener("input", () => {
  const start = input.selectionStart;
  const clean = normalize(input.value);
  input.value = formatted(clean);
  try {
    input.setSelectionRange(input.value.length, input.value.length);
  } catch {
    // Some mobile keyboards do not support cursor positioning.
  }
  if (feedback.classList.contains("is-error")) show("");
});

let appCheckStarted = false;

async function redeem(code) {
  const { getApp } = await import(
    "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js"
  );
  const { getAuth, signInAnonymously } = await import(
    "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js"
  );
  const { initializeAppCheck, ReCaptchaV3Provider } = await import(
    "https://www.gstatic.com/firebasejs/13.1.0/firebase-app-check.js"
  );
  const { getFunctions, httpsCallable } = await import(
    "https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js"
  );

  if (!guestAccessConfig.appCheckSiteKey)
    throw new Error("The secure invitation service has not been configured.");

  const app = getApp();
  if (!appCheckStarted) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(guestAccessConfig.appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckStarted = true;
  }

  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth);

  const fn = httpsCallable(
    getFunctions(app, guestAccessConfig.region),
    guestAccessConfig.callableName
  );
  const response = await fn({ code });
  return response.data;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = normalize(input.value);
  if (!CODE_ALPHABET.test(code)) {
    show("Please enter all eight characters from your invitation.", "error");
    input.focus();
    return;
  }
  if (!guestAccessConfig.enabled) {
    show(
      "This is a preview. We haven't issued real codes or activated Firebase verification yet."
    );
    return;
  }

  submit.disabled = true;
  show("Checking your invitation securely…");
  try {
    const verified = await redeem(code);
    if (verified.cameraOpen) {
      show(
        "Invitation verified. The camera upload window is open. Photo uploads will activate after the Drive connection is ready.",
        "ok"
      );
    } else {
      show(
        "Invitation verified. The camera will open during the wedding-day window. Until then, you can test your device camera locally.",
        "ok"
      );
    }
  } catch (err) {
    // Never echo detailed server errors to guests.
    const code = String(err?.code || "");
    if (code.includes("resource-exhausted")) {
      show("Too many attempts. Please try again later or ask a coordinator.", "error");
    } else if (code.includes("permission-denied") || code.includes("unauthenticated")) {
      show("Your session could not be verified. Please ask a coordinator for help.", "error");
    } else {
      show("Code not recognized, or verification is temporarily unavailable.", "error");
    }
  } finally {
    submit.disabled = false;
  }
});

window.addEventListener("hashchange", absorbInvitationUrl);
absorbInvitationUrl();
