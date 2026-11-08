import {readFileSync} from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const root = new URL("../",import.meta.url);
const rules = readFileSync(new URL("firestore.rules",root),"utf8");
const client = readFileSync(new URL("assets/planner-firestore.js",root),"utf8");
const planner = readFileSync(new URL("assets/planner.js",root),"utf8");
const app = readFileSync(new URL("assets/app.js",root),"utf8");
const html = readFileSync(new URL("index.html",root),"utf8");

const expected = [
  "babaynike2013@gmail.com",
  "josephsixson@mcstayuman.edu.ph",
  "nungaygela@gmail.com"
];

test("Firestore rules and planner client authorize the same three verified owner emails",()=>{
  for(const address of expected){
    assert.ok(rules.includes('request.auth.token.email == "'+address+'"'),address+" missing in security rules");
    assert.ok(client.includes('"'+address+'"'),address+" missing in planner client");
  }
  const allowlist=client.match(/const DEFAULT_OWNER_EMAILS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(allowlist,"owner list not found");
  const addresses=[...allowlist[1].matchAll(/"([^"]+@[^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(addresses,expected);
});

test("default owner requires authenticated, non-anonymous verified email",()=>{
  const body=rules.split("function isDefaultOwner() {")[1]?.split("function isHumanOrganizer()")[0];
  assert.ok(body,"owner rule missing");
  assert.match(body,/signedIn\(\)/);
  assert.match(body,/sign_in_provider != "anonymous"/);
  assert.match(body,/email_verified == true/);
  assert.match(client,/user\.emailVerified && DEFAULT_OWNER_EMAILS\.has\(email\)/);
});

test("bride owner inherits normal planner owner permissions without opening guest data",()=>{
  assert.match(client,/this\.role = "owner"/);
  assert.match(rules,/function canReadPlanning\(\)[\s\S]*?return isOwner\(\)/);
  assert.match(rules,/allow create, update: if isOwner\(\);/);
  assert.match(rules,/match \/invitationCodes\/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(rules,/match \/guestSessions\/\{document=\*\*\} \{\s*allow read, write: if false;/);
});

test("frontend and planner adapter cache versions are updated",()=>{
  assert.match(app,/const BUILD = "20261108-coowners1"/);
  assert.match(planner,/planner-firestore\.js\?v=20261108-coowners1/);
  assert.match(html,/assets\/app\.js\?v=20261108-coowners1/);
});

test("remote planner continues to share one Firestore wedding document",()=>{
  assert.match(client,/const WEDDING_ID = "main"/);
  assert.match(client,/getDoc\(weddingRef\)/);
  assert.match(client,/await batch\.commit\(\)/);
  assert.doesNotMatch(client,/onSnapshot\(/);
  assert.equal((rules.match(/\{/g)||[]).length,(rules.match(/\}/g)||[]).length);
});
