import {readFileSync} from "node:fs";
import {Script} from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const html=read("index.html");
const app=read("assets/app.js");
const planner=read("assets/planner.js");

test("new build reaches mobile devices",()=>{
  assert.match(app,/const BUILD = "20261108-funcfix1"/);
  assert.match(html,/assets\/app\.js\?v=20261108-funcfix1/);
});
test("planner script parses and explains callable errors",()=>{
  assert.doesNotThrow(()=>new Script(planner.replace(/^import .*\n/gm,"")));
  assert.match(planner,/function invitationServiceError\(error, service = "invitation service"\)/);
  assert.match(planner,/Firebase Console > Functions/);
  assert.match(planner,/GitHub Pages does not deploy Firebase Functions/);
  assert.match(planner,/code==="unauthenticated" \|\| code==="permission-denied"/);
  assert.match(planner,/invitationServiceError\(error,"invitation creation"\)/);
  assert.match(planner,/invitationServiceError\(error,"invitation list"\)/);
});
test("photo archive checks Drive and Firestore independently",()=>{
  assert.match(planner,/Promise\.allSettled\(\[\s*statusFn\(\{\}\),\s*listFn\(\{ limit: 300 \}\)/);
  assert.match(planner,/const storageReady=statusResult\.status==="fulfilled"/);
  assert.match(planner,/const archiveReady=listResult\.status==="fulfilled"/);
  assert.match(planner,/Drive storage: /);
  assert.match(planner,/Photo records: /);
  assert.match(planner,/archiveReady \? '<div class="planner-metrics compact">/);
  assert.match(planner,/storageReady \? '<div class="planner-budget-layout">/);
  assert.match(planner,/bindInvitationManager\(\);/);
});
test("never reveal secrets or bypass Firebase access control",()=>{
  assert.doesNotMatch(planner,/GOOGLE_DRIVE_OAUTH\s*=/);
  assert.doesNotMatch(planner,/INVITATION_CODE_HMAC_KEY\s*=/);
  assert.doesNotMatch(planner,/allow read, write: if true/);
});
