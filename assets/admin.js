/**
 * Private invitation manager. All records are loaded through admin-only
 * callable functions. The public GitHub Pages bundle contains no guest data.
 */
import { guestAccessConfig } from "./guest-config.js";
import { getWeddingClient, callWeddingFunction } from "./firebase-services.js";
import {
  GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
  getIdTokenResult, signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

const el = id => document.getElementById(id);
const connected = Boolean(guestAccessConfig.enabled && guestAccessConfig.appCheckSiteKey);
const state = { items: [], selectedId: null, busy: false, adminUser: null, code: null };
const form = el("admin-invitation-form");
const login = el("admin-login");
const consolePanel = el("admin-console");
const loginButton = el("admin-login-button");
const fields = {
  partyLabel: el("admin-party"),
  side: el("admin-side"),
  invitedSeats: el("admin-seats-input"),
  rsvp: el("admin-rsvp"),
  notes: el("admin-notes"),
};

function message(text, bad = false) {
  const target = el("admin-feedback");
  target.textContent = text;
  target.classList.toggle("error", bad);
}

function hideCode() {
  state.code = null;
  el("admin-link-result").hidden = true;
  el("admin-new-code").textContent = "";
  el("admin-new-link").value = "";
}
function showCode(result) {
  const code = result.formattedCode || result.code;
  state.code = code;
  el("admin-new-code").textContent = code;
  const url = location.origin + location.pathname + "#camera/" + code;
  el("admin-new-link").value = url;
  el("admin-link-result").hidden = false;
  el("admin-link-result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function setBusy(busy) {
  state.busy = busy;
  for (const id of [
    "admin-save","admin-new","admin-clear","admin-rotate",
    "admin-revoke","admin-refresh","admin-signout",
  ]) {
    el(id).disabled = busy;
  }
}
async function invoke(name, payload = {}) {
  if (!connected || !state.adminUser) throw new Error("Organizer service is not ready.");
  const fn = callWeddingFunction(name);
  const response = await fn(payload);
  return response.data;
}
function currentRecord() {
  return state.items.find(item => item.id === state.selectedId) || null;
}
function resetEditor() {
  state.selectedId = null;
  form.reset();
  fields.side.value = "Shared";
  fields.invitedSeats.value = "1";
  fields.rsvp.value = "Pending";
  el("admin-editor-title").textContent = "New invitation";
  el("admin-id-hint").textContent = "Automatic code";
  el("admin-record-status").value = "New invitation";
  el("admin-save").textContent = "Create invitation";
  el("admin-rotation-actions").hidden = true;
  hideCode();
  message("");
  paintList();
}
function chooseRecord(id) {
  const record = state.items.find(item => item.id === id);
  if (!record) return;
  state.selectedId = record.id;
  fields.partyLabel.value = record.partyLabel || "";
  fields.side.value = record.side || "Shared";
  fields.invitedSeats.value = String(record.invitedSeats || 1);
  fields.rsvp.value = record.rsvp || "Pending";
  fields.notes.value = record.notes || "";
  el("admin-editor-title").textContent = "Edit invitation";
  el("admin-id-hint").textContent = "Version " + record.revision;
  el("admin-record-status").value = record.status === "revoked" ? "Revoked" : "Active";
  el("admin-save").textContent = "Save changes";
  el("admin-rotation-actions").hidden = false;
  el("admin-rotate").textContent =
    record.status === "revoked" ? "Issue a fresh link" : "↻ Regenerate link";
  el("admin-revoke").disabled = record.status === "revoked";
  hideCode();
  message("");
  paintList();
}
function paintList() {
  const target = el("admin-invitation-list");
  target.replaceChildren();
  const term = el("admin-search").value.trim().toLowerCase();
  const filtered = state.items.filter(r =>
    (r.partyLabel + " " + r.side + " " + r.rsvp).toLowerCase().includes(term));
  if (!filtered.length) {
    const p = document.createElement("p");
    p.textContent = state.items.length ? "No invitations match that search." :
      "No invitations yet. Select + New to issue the first one.";
    target.appendChild(p);
    return;
  }
  for (const record of filtered) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "invitation-row" +
      (state.selectedId === record.id ? " selected" : "");
    btn.setAttribute("role", "listitem");
    const badge = document.createElement("b");
    badge.textContent = record.status === "revoked" ? "REVOKED" : "ACTIVE";
    if (record.status === "revoked") badge.className = "revoked";
    const label = document.createElement("strong");
    label.textContent = record.partyLabel;
    label.appendChild(badge);
    const meta = document.createElement("span");
    meta.textContent = record.side + " · " + record.invitedSeats +
      " seat(s) · RSVP " + record.rsvp;
    btn.append(label, meta);
    btn.addEventListener("click", () => chooseRecord(record.id));
    target.appendChild(btn);
  }
}
function paintSummary() {
  const active = state.items.filter(r => r.status === "active");
  el("admin-total").textContent = state.items.length.toString();
  el("admin-active").textContent = active.length.toString();
  el("admin-confirmed").textContent = active.filter(r => r.rsvp === "Yes").length.toString();
  el("admin-seats").textContent = active.reduce((n,r) => n + (r.invitedSeats || 0),0).toString();
}
async function refreshList(preferredId) {
  const data = await invoke("listInvitations");
  state.items = Array.isArray(data.items) ? data.items : [];
  paintSummary();
  if (preferredId && state.items.some(r => r.id === preferredId)) {
    // Preserve the code currently being shown if this is the just-created row.
    const oldCode = state.code;
    const codeBox = oldCode ? {
      code: el("admin-new-code").textContent,
      link: el("admin-new-link").value,
    } : null;
    chooseRecord(preferredId);
    if (codeBox) {
      state.code = codeBox.code;
      el("admin-new-code").textContent = codeBox.code;
      el("admin-new-link").value = codeBox.link;
      el("admin-link-result").hidden = false;
    }
  } else if (state.selectedId && state.items.some(r => r.id === state.selectedId)) {
    const selected = state.selectedId;
    chooseRecord(selected);
  } else {
    resetEditor();
  }
  paintList();
}

function formValues() {
  return {
    partyLabel: fields.partyLabel.value.trim(),
    side: fields.side.value,
    invitedSeats: Number(fields.invitedSeats.value),
    rsvp: fields.rsvp.value,
    notes: fields.notes.value.trim(),
  };
}
function explainError(error) {
  const code = String(error?.code || "");
  if (code.includes("permission-denied")) return "This account is not authorized to manage invitations.";
  if (code.includes("unauthenticated")) return "Please sign in again.";
  if (code.includes("resource-exhausted")) return "Too many requests. Please try again later.";
  if (code.includes("failed-precondition")) return "Firebase setup is incomplete.";
  return error?.message || "The request failed. Please try again.";
}
async function execute(action) {
  if (state.busy) return;
  setBusy(true);
  try { await action(); }
  catch (error) { message(explainError(error), true); }
  finally { setBusy(false); }
}
async function signIn() {
  if (!connected) return;
  loginButton.disabled = true;
  const info = el("admin-login-info");
  info.textContent = "Opening secure Google sign-in…";
  try {
    const { auth } = getWeddingClient();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  } catch (error) {
    info.textContent = explainError(error);
  } finally {
    loginButton.disabled = false;
  }
}
async function handleUser(user) {
  const info = el("admin-login-info");
  if (!user || user.isAnonymous) {
    state.adminUser = null;
    state.items = [];
    state.selectedId = null;
    hideCode();
    login.hidden = false;
    consolePanel.hidden = true;
    info.textContent = "Sign in with the Google account that has been granted organizer access.";
    return;
  }
  try {
    const claims = await getIdTokenResult(user, true);
    if (claims.claims.admin !== true) {
      state.adminUser = null;
      login.hidden = false;
      consolePanel.hidden = true;
      info.textContent = "This Google account has not been granted the organizer role. You can try another account.";
      return;
    }
    state.adminUser = user;
    login.hidden = true;
    consolePanel.hidden = false;
    el("admin-user-name").textContent = user.email || "Organizer";
    el("admin-status-pill").textContent = "PRIVATE ADMIN CONNECTED";
    el("admin-status-pill").classList.add("ready");
    await execute(() => refreshList());
  } catch (error) {
    login.hidden = false;
    consolePanel.hidden = true;
    info.textContent = explainError(error);
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  execute(async () => {
    const selectedId = state.selectedId;
    const result = await invoke(selectedId ? "updateInvitation" : "createInvitation",
      { ...formValues(), ...(selectedId ? { invitationId: selectedId } : {}) });
    if (!selectedId) {
      // The new code exists only in this response; do not persist it in browser storage.
      state.selectedId = result.invitationId;
      hideCode();
      showCode(result);
      await refreshList(result.invitationId);
      message("Invitation created. Copy the new link now; it won't be shown after you leave.");
    } else {
      await refreshList(selectedId);
      message("Invitation details saved. The current link has not changed.");
    }
  });
});
el("admin-new").addEventListener("click", resetEditor);
el("admin-clear").addEventListener("click", resetEditor);
el("admin-search").addEventListener("input", paintList);
el("admin-refresh").addEventListener("click", () =>
  execute(async () => { await refreshList(state.selectedId); message("List refreshed."); }));
el("admin-rotate").addEventListener("click", () => {
  const record = currentRecord();
  if (!record || state.busy) return;
  if (!window.confirm("Generate a replacement link for " + record.partyLabel +
    "?\n\nThe previous link and all older redeemed camera sessions will stop working immediately.")) return;
  execute(async () => {
    const result = await invoke("rotateInvitation", { invitationId: record.id });
    hideCode();
    showCode(result);
    await refreshList(record.id);
    message("Previous link revoked. Copy the replacement link now.");
  });
});
el("admin-revoke").addEventListener("click", () => {
  const record = currentRecord();
  if (!record || record.status === "revoked" || state.busy) return;
  if (!window.confirm("Revoke " + record.partyLabel +
    "'s invitation now? This will block the link and older sessions. You can issue a fresh link later.")) return;
  execute(async () => {
    await invoke("revokeInvitation", { invitationId: record.id });
    hideCode();
    await refreshList(record.id);
    message("Invitation revoked. Its previous link is no longer valid.");
  });
});
async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    message("Copied to clipboard.");
  } catch {
    message("Clipboard access was blocked. Select the link field and copy it manually.", true);
    el("admin-new-link").focus();
    el("admin-new-link").select();
  }
}
el("admin-copy-code").addEventListener("click", () =>
  copyText(el("admin-new-code").textContent));
el("admin-copy-link").addEventListener("click", () =>
  copyText(el("admin-new-link").value));
el("admin-login-button").addEventListener("click", signIn);
el("admin-signout").addEventListener("click", () =>
  execute(async () => {
    await signOut(getWeddingClient().auth);
    resetEditor();
  }));

if (!connected) {
  el("admin-status-pill").textContent = "BACKEND NOT DEPLOYED";
  el("admin-login-info").textContent =
    "The private invitation manager is built, but protected Firebase functions and App Check haven't been deployed. No live links can be issued yet.";
  el("admin-login-button").disabled = true;
} else {
  el("admin-status-pill").textContent = "SIGN-IN REQUIRED";
  loginButton.disabled = false;
  onAuthStateChanged(getWeddingClient().auth, handleUser, error => {
    el("admin-login-info").textContent = explainError(error);
  });
}
