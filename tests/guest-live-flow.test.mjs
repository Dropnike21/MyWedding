import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
const read = filename => readFileSync(new URL("../"+filename,import.meta.url),"utf8");
const backend=read("functions/index.js");
const guest=read("assets/guest-camera.js");
const guestDetails=read("assets/guest-details.js");
const guestDetailsHtml=read("guest-details.html");
const planner=read("assets/planner.js");
const html=read("index.html");
const config=read("assets/guest-config.js");
const css=read("assets/camera-portrait.css");

test("guest, guest-details, planner and backend scripts parse",()=>{
  assert.doesNotThrow(()=>new Script(backend));
  assert.doesNotThrow(()=>new Script(guest.replace(/^import .*\n/gm,"")));
  assert.doesNotThrow(()=>new Script(guestDetails.replace(/^import .*\n/gm,"")));
  assert.doesNotThrow(()=>new Script(planner.replace(/^import .*\n/gm,"")));
});
test("production callables remain auth-protected while App Check is non-blocking",()=>{
  assert.match(backend,/enforceAppCheck: false/);
  assert.match(backend,/requireAdmin\(request\)/);
  assert.match(backend,/requireGuest\(request\)/);
});
test("normal invitation flow has no rehearsal or preview code",()=>{
  assert.match(config,/enabled: true/);
  assert.match(config,/driveUploadsEnabled: true/);
  assert.doesNotMatch(config,/previewTestCode|previewTestEnabled/);
  assert.doesNotMatch(backend,/startCameraRehearsal|createCameraRehearsalPass|cameraRehearsal|testMode/);
  assert.doesNotMatch(guest,/rehearsalRequested|previewTestCode|cameraRehearsal/);
});
test("clean invitation sends practical details to a separate page",()=>{
  assert.match(html,/id="guest-invitation-details-link"/);
  assert.match(html,/View guest details &amp; attendance/);
  assert.doesNotMatch(html,/id="guest-invite-guide"/);
  assert.doesNotMatch(html,/id="guest-invitation-rsvp"/);
  assert.match(guest,/guest-details\.html#"/);
  assert.match(guestDetailsHtml,/id="guest-guide-grid"/);
  assert.match(guestDetailsHtml,/id="guest-details-rsvp-form"/);
  assert.match(guestDetails,/respondToInvitation/);
  assert.match(guestDetails,/guestGuide/);
});
test("owner can reopen and resend an existing invitation without rotating it",()=>{
  assert.match(backend,/function encryptCode\(code\)/);
  assert.match(backend,/function decryptCode\(vault\)/);
  assert.match(backend,/codeVault: encryptCode\(code\)/);
  assert.match(backend,/exports\.listInvitations = onCall\(configuration\(\)/);
  assert.match(backend,/linkRecoverable:Boolean\(code\)/);
  assert.match(planner,/View link &amp; message/);
  assert.match(planner,/data-invitation-action="view"/);
  assert.match(planner,/Existing invitation ready to resend/);
});
test("legacy invitations require only one rotation before owner recovery is available",()=>{
  assert.match(planner,/Legacy link · regenerate once/);
  assert.match(planner,/created before reusable owner links were enabled/);
  assert.match(backend,/codeVault: encryptCode\(code\)/);
});
test("owner Messenger copy still uses Planning Studio details",()=>{
  assert.match(planner,/Messenger message/);
  assert.match(planner,/Copy Messenger message/);
  assert.match(planner,/full wedding guide/);
  assert.match(planner,/rsvpMode/);
});
test("confirmation can use website, Messenger, or both on Guest Details",()=>{
  assert.match(planner,/rsvpMode: "Both"/);
  assert.match(planner,/\["Both","Messenger only","Website only"\]/);
  assert.match(guestDetailsHtml,/id="guest-messenger-confirmation"/);
  assert.match(guestDetailsHtml,/id="guest-details-rsvp-form"/);
  assert.match(guestDetails,/mode==="Website only"/);
  assert.match(guestDetails,/mode==="Messenger only"/);
});
test("website RSVP updates linked Planning Studio guest",()=>{
  assert.match(backend,/sourceGuestId=optionalText\(invitation\.get\("sourceGuestId"\),100\)/);
  assert.match(backend,/tx\.update\(planningGuestRef/);
  assert.match(backend,/confirmed:attending/);
});
test("manual Planning Studio confirmation is reflected back on invitation",()=>{
  const start=backend.indexOf("exports.getInvitationDetails");
  const end=backend.indexOf("exports.redeemInvitation",start);
  const body=backend.slice(start,end);
  assert.match(body,/weddings\/main\/guests\//);
  assert.match(body,/rsvp=guest\.get\("rsvp"\) \|\| rsvp/);
  assert.match(body,/confirmedSeats=Number\(guest\.get\("confirmed"\)\|\|0\)/);
});
test("camera access belongs to each invitation and has no one-hour timer",()=>{
  assert.match(backend,/exports\.setInvitationCameraAccess = onCall/);
  assert.match(backend,/cameraAccessEnabled:request\.data\.enabled/);
  assert.match(backend,/if \(manualEnabled\) return \{cameraOpen:true,openAt:null,closeAt:null\}/);
  assert.match(planner,/data-invitation-action="camera"/);
  assert.match(guest,/leaveCameraMode\(\);/);
});
test("full deletion revokes code recovery before cleanup",()=>{
  const from=backend.indexOf("exports.deleteInvitationAndPhotos");
  const to=backend.indexOf("exports.getInvitationDetails",from);
  const body=backend.slice(from,to);
  assert.ok(from>=0 && to>from);
  assert.match(body,/status:"deleting",codeDigest:null,codeVault:null,cameraAccessEnabled:false/);
  assert.match(body,/drive\.files\.delete\(/);
  assert.match(body,/sheets\.spreadsheets\.batchUpdate\(/);
  assert.match(body,/cleanup\.delete\(db\.doc\("weddings\/main\/guests\/"\+linkedGuest\)\)/);
});
test("camera uploads remain production Drive uploads",()=>{
  assert.match(guest,/wedding:photo-uploaded/);
  assert.match(guest,/wedding:photo-upload-failed/);
  assert.match(guest,/setInterval\(refreshSharedFilm,15000\)/);
  assert.match(css,/flex-direction:column!important/);
});
