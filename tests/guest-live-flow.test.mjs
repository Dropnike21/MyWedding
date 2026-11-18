import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";
const read = filename => readFileSync(new URL("../"+filename,import.meta.url),"utf8");
const backend=read("functions/index.js");
const guest=read("assets/guest-camera.js");
const planner=read("assets/planner.js");
const html=read("index.html");
const config=read("assets/guest-config.js");
const css=read("assets/camera-portrait.css");

test("guest, planner and backend scripts parse",()=>{
  assert.doesNotThrow(()=>new Script(backend));
  assert.doesNotThrow(()=>new Script(guest.replace(/^import .*\n/gm,"")));
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
test("guest manager issues real links and Messenger copy",()=>{
  assert.match(planner,/function invitationManagerCard\(\)/);
  assert.match(planner,/run\("createInvitation",\{/);
  assert.match(planner,/sourceGuestId:guest\.id/);
  assert.match(planner,/run\("setInvitationCameraAccess",\{/);
  assert.match(planner,/id='planner-invitation-manage'/);
  assert.match(planner,/Messenger message/);
  assert.match(planner,/Copy Messenger message/);
  assert.match(planner,/invitationMessage=/);
});
test("invitation shows wedding details before camera",()=>{
  assert.match(html,/id="guest-invitation-details"/);
  assert.match(html,/id="guest-detail-date"/);
  assert.match(html,/id="guest-detail-ceremony"/);
  assert.match(html,/id="guest-detail-venue"/);
  assert.match(html,/id="guest-detail-city"/);
  assert.match(html,/id="guest-detail-seats"/);
  assert.ok(html.indexOf('id="guest-invitation-details"') < html.indexOf('id="guest-invitation-continue"'));
  assert.match(guest,/renderInvitationDetails/);
});
test("confirmation can use website, Messenger, or both",()=>{
  assert.match(planner,/rsvpMode: "Both"/);
  assert.match(planner,/\["Both","Messenger only","Website only"\]/);
  assert.match(html,/id="guest-confirmation-messenger"/);
  assert.match(html,/id="guest-invitation-rsvp"/);
  assert.match(guest,/mode!=="Messenger only"/);
  assert.match(guest,/mode!=="Website only"/);
  assert.match(guest,/respondToInvitation/);
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
test("full deletion revokes access before removing Drive, Sheet and Firestore",()=>{
  const from=backend.indexOf("exports.deleteInvitationAndPhotos");
  const to=backend.indexOf("exports.getInvitationDetails",from);
  const body=backend.slice(from,to);
  assert.ok(from>=0 && to>from);
  assert.match(body,/requireAdmin\(request\)/);
  assert.match(body,/status:"deleting",codeDigest:null,cameraAccessEnabled:false/);
  assert.match(body,/drive\.files\.delete\(/);
  assert.match(body,/sheets\.spreadsheets\.batchUpdate\(/);
  assert.match(body,/cleanup\.delete\(db\.doc\("weddings\/main\/guests\/"\+linkedGuest\)\)/);
  assert.match(planner,/verified!=="DELETE"/);
});
test("camera uploads remain production Drive uploads",()=>{
  assert.match(guest,/wedding:photo-uploaded/);
  assert.match(guest,/wedding:photo-upload-failed/);
  assert.match(guest,/setInterval\(refreshSharedFilm,15000\)/);
  assert.match(css,/flex-direction:column!important/);
});
