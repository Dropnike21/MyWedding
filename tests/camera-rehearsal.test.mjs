import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";

const root=new URL("../",import.meta.url);
const read=path=>readFileSync(new URL(path,root),"utf8");
const html=read("index.html");
const guest=read("assets/guest-camera.js");
const app=read("assets/app.js");
const planner=read("assets/planner.js");
const backend=read("functions/index.js");
const portrait=read("assets/camera-portrait.css");
const inviteCss=read("assets/guest-invitation.css");
const config=read("assets/guest-config.js");

test("JavaScript parses and new camera assets are included",()=>{
  assert.doesNotThrow(()=>new Script(app));
  assert.doesNotThrow(()=>new Script(backend));
  assert.doesNotThrow(()=>new Script(guest.replace(/^import .*\n/gm,"")));
  assert.doesNotThrow(()=>new Script(planner.replace(/^import .*\n/gm,"")));
  assert.match(html,/camera-portrait\.css\?v=20261108-rehearsal1/);
  assert.match(html,/guest-invitation\.css\?v=20261108-rehearsal1/);
  assert.equal((portrait.match(/{/g)||[]).length,(portrait.match(/}/g)||[]).length);
  assert.equal((inviteCss.match(/{/g)||[]).length,(inviteCss.match(/}/g)||[]).length);
});

test("portrait-only interface has no camera tilt listeners or rotate button",()=>{
  assert.doesNotMatch(html,/id="camera-rotate"/);
  assert.doesNotMatch(app,/handleCameraDeviceTilt|toggleCameraOrientation|manualLandscape/);
  assert.match(app,/function isCameraLandscape\(\) \{[\s\S]*?return false;/);
  assert.match(app,/function isFilmVertical\(\) \{[\s\S]*?return false;/);
  assert.match(portrait,/orientation:landscape/);
  assert.match(portrait,/camera-session \.camera-action-rail\{[\s\S]*?flex-direction:column!important/);
});

test("invitation link opens designed guest arrival before server redemption",()=>{
  for(const id of ["guest-invitation-landing","guest-invitation-title",
    "guest-invitation-date","guest-invitation-code","guest-invitation-continue",
    "guest-invitation-enter-code"])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(guest,/function showInvitationLanding\(code\)/);
  assert.match(guest,/showInvitationLanding\(code\);\s*return code;/);
  assert.match(guest,/landingContinue\?\.addEventListener\("click",async\(\)=>/);
  assert.match(guest,/verifyCode\(code,\{fromLink:true\}\)/);
  assert.doesNotMatch(guest,/if \(code\) \{\s*verifyCode\(code/);
});

test("organizer can preview or generate a five-frame real rehearsal pass",()=>{
  for(const id of ["rehearsal-preview","rehearsal-start","rehearsal-generate",
    "rehearsal-stop","rehearsal-link"])
    assert.ok(planner.includes(id),id);
  assert.match(planner,/callWeddingFunction\(name\)/);
  assert.match(planner,/weddingLink\("#camera\/"\+code,"\?cameraRehearsal=1"\)/);
  assert.match(planner,/weddingLink\("#camera\/AJ27TEST"\)/);
  assert.match(backend,/exports\.createCameraRehearsalPass = onCall\(configuration\(\)/);
  assert.match(backend,/testMode:true,photoLimit:5/);
  assert.match(backend,/partyLabel:"Camera Rehearsal/);
  assert.match(backend,/exports\.startCameraRehearsal/);
  assert.match(backend,/exports\.stopCameraRehearsal/);
});

test("rehearsal is isolated from wedding event window and old codes expire",()=>{
  assert.match(backend,/testMode \? "weddingSettings\/cameraRehearsal" : "weddingSettings\/camera"/);
  assert.match(backend,/rehearsalId=randomBytes\(16\)\.toString\("hex"\)/);
  assert.match(backend,/rehearsalId:rehearsal\.rehearsalId/);
  assert.match(backend,/rehearsal\.rehearsalId !== invitation\.get\("rehearsalId"\)/);
  assert.match(backend,/schedule\.get\("rehearsalId"\)/);
  assert.match(backend,/requireAdmin\(request\);/);
  assert.match(backend,/DEFAULT_OWNER_EMAILS/);
});

test("upload is server-validated, Drive-private and safe to retry or cancel",()=>{
  assert.match(guest,/beginGuestPhotoUpload|beginPhotoUploadCallable/);
  assert.match(guest,/finalizePhotoUploadCallable/);
  assert.match(guest,/wedding:photo-uploaded/);
  assert.match(guest,/wedding:photo-upload-failed/);
  assert.match(backend,/const prefix=session\.testMode \? "TEST_AJ_"/);
  assert.match(backend,/tx\.update\(invitationRef, \{\s*photosUsed: frameNumber/);
  assert.match(backend,/tx\.get\(pendingRef\)/);
  assert.match(backend,/pendingState\.get\("status"\) !== "uploading"/);
  assert.match(backend,/if\(committed\.exists \|\| snap\.get\("status"\)==="finalized"\)return null;/);
  assert.match(backend,/testMode: pending\.testMode === true/);
});

test("two devices share film status without downloading other photos",()=>{
  assert.match(guest,/setInterval\(refreshSharedFilm,15000\)/);
  assert.match(guest,/checkRememberedSession\(\)/);
  assert.match(guest,/wedding:photo-synced/);
  assert.match(app,/addHistoryFrame\(number\)/);
  assert.match(app,/captureSequence\+=1/);
  assert.match(app,/frame\.node\?\.classList\.add\("is-upload-failed"\)/);
});

test("rehearsal is opt-in, production guest switch remains off",()=>{
  assert.match(config,/enabled: false/);
  assert.match(config,/driveUploadsEnabled: false/);
  assert.match(guest,/rehearsalRequested && cameraAccess\?\.testMode === true/);
  assert.match(guest,/verified\.testMode !== true/);
  assert.match(backend,/testMode:true/);
});
