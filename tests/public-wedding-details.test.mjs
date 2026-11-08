import {readFileSync} from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {runInNewContext} from "node:vm";

const root=new URL("../",import.meta.url);
const html=readFileSync(new URL("index.html",root),"utf8");
const app=readFileSync(new URL("assets/app.js",root),"utf8");
const details=readFileSync(new URL("assets/public-wedding.js",root),"utf8");
const planner=readFileSync(new URL("assets/planner.js",root),"utf8");
const store=readFileSync(new URL("assets/planner-firestore.js",root),"utf8");
const rules=readFileSync(new URL("firestore.rules",root),"utf8");

test("no February 23 public display or stale planner seed",()=>{
  for(const [name,content] of [["index",html],["app",app],["planner",planner]]) {
    assert.doesNotMatch(content,/2027-02-23|February 23,? 2027|23 February 2027|02 · 23/i,name);
  }
  assert.doesNotMatch(html,/class="topline"/);
  assert.match(planner,/date: "2027-12-23"/);
  assert.match(html,/id="wedding-big-day"/);
  assert.match(html,/id="wedding-big-day-note"/);
  assert.match(html,/id="wedding-date-seal"/);
  assert.match(html,/id="wedding-venue-fact"/);
  assert.match(html,/id="wedding-venue-fact-note"/);
});

test("public display uses a single safe Firebase document",()=>{
  assert.match(app,/import\(featureUrl\("public-wedding\.js"\)\)/);
  assert.doesNotMatch(app,/new Date\("2027-02-23/);
  assert.match(details,/onSnapshot\(doc\(firestore,"publicWeddingDetails","current"\)/);
  assert.match(details,/date: "2027-12-23"/);
  assert.doesNotMatch(details,/doc\(firestore,"weddings"/);
  assert.match(details,/venueJourney\.hidden=!known/);
});

test("public date validator rejects invalid calendar dates",()=>{
  const from=details.indexOf("function validDate(value) {");
  const to=details.indexOf("function matchesConfiguredVenue(",from);
  assert.ok(from>=0 && to>from);
  const fn=runInNewContext("(function(DATE_PATTERN){"+details.slice(from,to)+";return {validDate,normalize};})")(
    /^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/
  );
  assert.equal(fn.validDate("2027-12-23"),true);
  assert.equal(fn.validDate("2027-02-30"),false);
  assert.equal(fn.validDate("2027-13-23"),false);
  assert.equal(fn.validDate("2028-02-29"),true);
  assert.equal(fn.validDate("2027-02-29"),false);
  assert.equal(fn.normalize({date:"2027-12-23",venueName:" Estoria "}).venueName,"Estoria");
  assert.equal(fn.normalize({date:"2027-02-30",venueName:"Old"}),null);
});

test("public date and venue render consistently while hiding stale directions",()=>{
  const from=details.indexOf("function matchesConfiguredVenue(");
  const to=details.indexOf("export async function start()",from);
  assert.ok(from>=0 && to>from);
  const nodes=new Map();
  const document={
    getElementById(id){if(!nodes.has(id))nodes.set(id,{textContent:"",hidden:false});return nodes.get(id)},
    dispatchEvent(){},
  };
  const window={WEDDING_VENUE:{name:"Estoria Manila",shortName:"Estoria"}};
  const CustomEvent=class{constructor(){}};
  const func=runInNewContext(
    "(function(window,document,normalize,CustomEvent,DAY_MS){let details={date:'2027-12-23'};"+
    details.slice(from,to)+";return {apply};})"
  );
  const display=func(window,document,obj=>obj,CustomEvent,86400000);
  display.apply({date:"2027-12-23",dateTentative:true,venueName:"Estoria",venueTentative:true});
  assert.equal(nodes.get("wedding-date-seal").textContent,"12 · 23");
  assert.match(nodes.get("wedding-big-day").textContent,/December.*23.*2027/);
  assert.match(nodes.get("wedding-big-day-note").textContent,/Thursday.*Tentative/);
  assert.equal(nodes.get("venue-journey").hidden,false);
  display.apply({date:"2027-12-23",dateTentative:true,venueName:"Another venue",venueTentative:true});
  assert.equal(nodes.get("venue-journey").hidden,true);
  assert.equal(nodes.get("wedding-venue-fact").textContent,"Another venue");
});

test("only owners publish a strict public projection; private planner stays protected",()=>{
  assert.match(rules,/match \/publicWeddingDetails\/current \{/);
  assert.match(rules,/allow get: if true;/);
  assert.match(rules,/allow list: if false;/);
  assert.match(rules,/allow create, update: if isOwner\(\)/);
  assert.match(rules,/request\.resource\.data\.keys\(\)\.hasOnly/);
  assert.match(rules,/allow delete: if false;/);
  assert.match(rules,/match \/weddings\/\{weddingId\} \{/);
  assert.match(rules,/allow read: if canReadPlanning\(\)/);
  assert.equal((rules.match(/{/g)||[]).length,(rules.match(/}/g)||[]).length);
  assert.match(store,/async publishPublicDetails\(settings\)/);
  assert.match(store,/doc\(this\.db,"publicWeddingDetails","current"\)/);
  assert.match(store,/await setDoc\(ref,\{\.\.\.details,updatedAt:serverTimestamp\(\)\}\)/);
  assert.match(store,/changed\.includes\("settings"\)/);
  assert.match(planner,/planner-firestore\.js\?v=20261108-public1/);
});

test("guest photo and planning features remain independently gated",()=>{
  assert.match(html,/id="camera-session"/);
  assert.match(html,/id="planner-secure-shell"/);
  assert.match(details,/never load the private weddings\/main/i);
});
