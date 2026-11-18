import {readFileSync} from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const root=new URL("../",import.meta.url);
const html=readFileSync(new URL("index.html",root),"utf8");
const app=readFileSync(new URL("assets/app.js",root),"utf8");
const details=readFileSync(new URL("assets/public-wedding.js",root),"utf8");
const planner=readFileSync(new URL("assets/planner.js",root),"utf8");
const store=readFileSync(new URL("assets/planner-firestore.js",root),"utf8");
const rules=readFileSync(new URL("firestore.rules",root),"utf8");

test("public wedding details have no obsolete hard-coded venue or date",()=>{
  for(const [name,content] of [["index",html],["app",app],["details",details]]){
    assert.doesNotMatch(content,/2027-12-23|December 23, 2027|Estoria|Ermita/i,name);
  }
  assert.doesNotMatch(html,/venue-config\.js/);
  assert.match(html,/Date to be confirmed/);
  assert.match(html,/Venue to be confirmed/);
});

test("Planning Studio is the source of guest-safe wedding details",()=>{
  assert.match(planner,/formField\("date","Wedding date"/);
  assert.match(planner,/formField\("ceremony","Ceremony \/ event type"/);
  assert.match(planner,/formField\("venue","Wedding venue"/);
  assert.match(planner,/formField\("city","City \/ municipality"/);
  assert.match(planner,/formField\("rsvpMode","Guest confirmation"/);
  assert.match(store,/ceremony:String\(settings\?\.ceremony \|\| ""\)/);
  assert.match(store,/venueName:String\(settings\?\.venue \|\| ""\)/);
  assert.match(store,/city:String\(settings\?\.city \|\| ""\)/);
  assert.match(store,/rsvpMode/);
});

test("public site reads only the safe Firebase projection",()=>{
  assert.match(app,/import\(featureUrl\("public-wedding\.js"\)\)/);
  assert.match(details,/onSnapshot\(doc\(firestore,"publicWeddingDetails","current"\)/);
  assert.doesNotMatch(details,/doc\(firestore,"weddings"/);
  assert.match(details,/window\.WEDDING_PUBLIC_DETAILS=\{\.\.\.details\}/);
  assert.match(app,/wedding:public-details/);
  assert.doesNotMatch(app,/WEDDING_VENUE/);
});

test("public Firestore rules allow only guest-safe Event Setup fields",()=>{
  assert.match(rules,/match \/publicWeddingDetails\/current \{/);
  assert.match(rules,/allow get: if true;/);
  assert.match(rules,/allow list: if false;/);
  assert.match(rules,/allow create, update: if isOwner\(\)/);
  for(const field of ["date","dateTentative","ceremony","venueName","city","venueTentative","rsvpMode","guestGuide","updatedAt"])
    assert.match(rules,new RegExp('"'+field+'"'));
  assert.match(rules,/request\.resource\.data\.date == ""/);
  assert.match(rules,/request\.resource\.data\.rsvpMode in \["Both", "Messenger only", "Website only"\]/);
  assert.match(rules,/allow delete: if false;/);
  assert.equal((rules.match(/{/g)||[]).length,(rules.match(/}/g)||[]).length);
});

test("Guest Guide is included in the guest-safe public projection",()=>{
  assert.match(store,/guestGuide/);
  assert.match(store,/whatToBring/);
  assert.match(store,/venueInstructions/);
  assert.match(rules,/request\.resource\.data\.guestGuide is map/);
  assert.match(rules,/transportParking/);
  assert.match(details,/guestGuide/);
});

test("venue map is driven by published Planning Studio values",()=>{
  assert.match(html,/id="venue-journey"[^>]*hidden/);
  assert.match(app,/const name=String\(detail\.venueName\|\|""\)/);
  assert.match(app,/const city=String\(detail\.city\|\|""\)/);
  assert.match(app,/destination=\[name,city\]\.filter\(Boolean\)\.join/);
});

test("current dynamic detail cache version is used",()=>{
  assert.match(app,/const BUILD = "20261119-invitecopy1"/);
  assert.match(html,/assets\/app\.js\?v=20261119-invitecopy1/);
  assert.match(planner,/planner-firestore\.js\?v=20261119-guestdetails1/);
});
