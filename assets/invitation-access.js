import { guestAccessConfig } from "./guest-config.js?v=20261031-1810";
import { getWeddingClient, callWeddingFunction } from "./firebase-services.js?v=20261031-1810";

const form = document.getElementById("invitation-form");
const input = document.getElementById("invitation-code");
const feedback = document.getElementById("invitation-status");
const submit = document.getElementById("check-invitation");
const testCameraButton = document.getElementById("start-camera");
if (guestAccessConfig.enabled) {
  testCameraButton.disabled = true;
  testCameraButton.setAttribute("aria-disabled", "true");
  document.getElementById("camera-message").textContent =
    "Please verify your invitation above. The camera opens only during the approved wedding window.";
}
const rsvpCard = document.getElementById("guest-rsvp-card");
const rsvpForm = document.getElementById("guest-rsvp-form");
const rsvpChoice = document.getElementById("guest-rsvp-choice");
const rsvpSeats = document.getElementById("guest-rsvp-seats");
const rsvpSeatsWrap = document.getElementById("guest-rsvp-seats-wrap");
const rsvpFeedback = document.getElementById("guest-rsvp-feedback");
const rsvpSave = document.getElementById("guest-rsvp-save");


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

async function redeem(code) {
  const { auth } = getWeddingClient();
  const { signInAnonymously } = await import(
    "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js"
  );
  if (!auth.currentUser) await signInAnonymously(auth);
  const fn = callWeddingFunction(guestAccessConfig.callableName);
  const response = await fn({ code });
  return response.data;
}

function showRSVP(guest) {
  if (!guest || !guest.verified || !guest.invitation) return;
  const invitation = guest.invitation;
  const max = Math.min(30, Math.max(1, Number(invitation.invitedSeats) || 1));
  document.getElementById("guest-rsvp-greeting").textContent =
    "Invitation for " + (invitation.partyLabel || "our guests") + ".";
  rsvpSeats.max = String(max);
  rsvpSeats.value = String(Math.max(1, Math.min(max, Number(invitation.confirmedSeats) || 1)));
  rsvpChoice.value = ["Yes", "No", "Maybe"].includes(invitation.rsvp)
    ? invitation.rsvp : "Yes";
  if (rsvpChoice.value === "Pending") rsvpChoice.value = "Yes";
  rsvpCard.hidden = false;
  updateSeatField();
  rsvpFeedback.textContent = "";
  rsvpCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function updateSeatField() {
  const yes = rsvpChoice.value === "Yes";
  rsvpSeatsWrap.hidden = !yes;
  rsvpSeats.required = yes;
}
rsvpChoice.addEventListener("change", updateSeatField);
rsvpForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!rsvpForm.reportValidity() || !guestAccessConfig.enabled) return;
  rsvpSave.disabled = true;
  rsvpFeedback.textContent = "Saving your response…";
  try {
    const fn = callWeddingFunction("respondToInvitation");
    await fn({
      rsvp: rsvpChoice.value,
      attendingSeats: rsvpChoice.value === "Yes" ? Number(rsvpSeats.value) : 0,
    });
    rsvpFeedback.textContent = "Thank you! Your RSVP has been saved.";
  } catch (error) {
    const denied = String(error?.code || "").includes("permission-denied");
    rsvpFeedback.textContent = denied
      ? "This invitation was replaced or expired. Please open the latest invitation link."
      : "We couldn't save your response. Please try again.";
    if (denied) rsvpCard.hidden = true;
  } finally {
    rsvpSave.disabled = false;
  }
});

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
  rsvpCard.hidden = true;
  if (guestAccessConfig.enabled) {
    testCameraButton.disabled = true;
  }
  show("Checking your invitation securely…");
  try {
    const verified = await redeem(code);
    showRSVP(verified);
    testCameraButton.disabled = !verified.cameraOpen;
    testCameraButton.setAttribute("aria-disabled", String(!verified.cameraOpen));
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
