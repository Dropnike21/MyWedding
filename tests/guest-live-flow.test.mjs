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
test("normal invitation and no one-hour rehearsal",()=>{
  assert.match(config,/enabled: true/);
  assert.match(config,/driveUploadsEnabled: true/);
  assert.doesNotMatch(config,/previewTestCode/);
  assert.doesNotMatch(backend,/startCameraRehearsal|createCameraRehearsalPass|cameraRehearsalStatus|cameraRehearsal|testMode/);
  assert.doesNotMatch(guest,/rehearsalRequested|previewTestCode|cameraRehearsal/);
  assert.doesNotMatch(planner,/startCameraRehearsal|createCameraRehearsalPass|cameraRehearsal/);
  assert.doesNotMatch(html,/camera-preview-helper|camera-use-test-code|camera-rotate/);
});
test("guest manager generates normal links from saved guest records",()=>{
  assert.match(planner,/function invitationManagerCard\(\)/);
  assert.match(planner,/active\(db.guests\)/);
  assert.match(planner,/function guestInvitationUrl\(code\)/);
  assert.match(planner,/callWeddingFunction\(name\)\(data\)/);
  assert.match(planner,/run\("createInvitation",\{/);
  assert.match(planner,/sourceGuestId:guest.id/);
  assert.match(planner,/run\("setInvitationCameraAccess",\{/);
  assert.match(planner,/id='planner-invitation-manage'/);
  assert.doesNotMatch(planner,/\?cameraRehearsal=1/);
  assert.match(backend,/const fixedId=guestId \? "guest_"\+guestId : ""/);
});
test("invitation link lands first and loads only safe personalized details",()=>{
  assert.match(guest,/function showInvitationLanding\(code\)/);
  assert.match(guest,/getInvitationDetails/);
  assert.match(guest,/partyLabel/);
  assert.match(html,/id="guest-invitation-landing"/);
  assert.match(html,/id="guest-invitation-recipient"/);
  assert.match(backend,/exports\.getInvitationDetails = onCall/);
  assert.match(backend,/requireGuest\(request\)/);
  assert.match(backend,/return \{\s*partyLabel:optionalText/);
  assert.doesNotMatch(backend,/weddingDate:"2027-12-23"/);
});
test("camera access belongs to each invitation and has no one-hour timer",()=>{
  assert.match(backend,/exports\.setInvitationCameraAccess = onCall/);
  assert.match(backend,/cameraAccessEnabled:request\.data\.enabled/);
  assert.match(backend,/cameraWindow\(manualEnabled\)/);
  assert.match(backend,/if \(manualEnabled\) return \{cameraOpen:true,openAt:null,closeAt:null\}/);
  assert.match(backend,/cameraWindow\(session\.cameraAccessEnabled\)/);
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
  assert.match(body,/db\.collection\("photoUploads"\)\.where\("invitationId","==",id\)/);
  assert.match(body,/db\.collection\("pendingPhotoUploads"\)\.where\("invitationId","==",id\)/);
  assert.match(body,/db\.collection\("guestSessions"\)\.where\("invitationId","==",id\)/);
  assert.match(body,/drive\.files\.list\(/);
  assert.match(body,/drive\.files\.delete\(/);
  assert.match(body,/sheets\.spreadsheets\.batchUpdate\(/);
  assert.match(body,/await ref\.delete\(\)/);
  assert.ok(body.indexOf("await ref.delete()")>body.indexOf("sheets.spreadsheets.batchUpdate"));
  assert.match(planner,/verified!=="DELETE"/);
  assert.match(planner,/db\.guests=db\.guests\.filter\(g=>g\.id!==item\.sourceGuestId\)/);
  assert.match(planner,/if\(item\.status==="deleting"/);
});
test("deleted photos do not silently count as saved and camera remains portrait",()=>{
  assert.match(guest,/wedding:photo-uploaded/);
  assert.match(guest,/wedding:photo-upload-failed/);
  assert.match(guest,/setInterval\(refreshSharedFilm,15000\)/);
  assert.match(css,/flex-direction:column!important/);
  assert.doesNotMatch(html,/camera-rotate/);
});
