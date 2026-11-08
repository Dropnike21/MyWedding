import {readFileSync} from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const mobile=readFileSync(new URL("../assets/mobile-layout.css",import.meta.url),"utf8");
const app=readFileSync(new URL("../assets/app.js",import.meta.url),"utf8");
const planner=readFileSync(new URL("../assets/planner.js",import.meta.url),"utf8");

const plannerViews=[
  "overview","settings","guests","vendors","expenses","photos","budget",
  "tasks","timeline","decisions","team"
];

test("top navigation remains accessible without a floating bottom overlay",()=>{
  const buttons=[...html.matchAll(/<button[^>]+data-view="([^"]+)"[^>]*>/g)];
  assert.deepEqual(buttons.map(x=>x[1]),["home","planner","camera","system"]);
  for(const [view] of buttons.map(x=>[x[1]])) {
    assert.ok(html.includes('data-view="'+view+'"'),view);
  }
  assert.ok(mobile.includes(".main-nav{"));
  assert.ok(mobile.includes("position:static!important"),"mobile nav must be in header flow");
  assert.ok(mobile.includes("padding-bottom:0!important"),"no bottom-dock padding");
  assert.ok(mobile.includes("position:sticky!important"),"header remains accessible while scrolling");
  assert.ok(mobile.includes(".nav-full-label{display:none}"));
  assert.ok(mobile.includes(".nav-mobile-label{display:inline}"));
});

test("the mobile stylesheet loads after theme and uses a versioned asset",()=>{
  const theme=html.indexOf("theme-spring-pastels.css");
  const layout=html.indexOf("mobile-layout.css?v=20261108-mobile1");
  assert.ok(theme>=0 && layout>theme);
  const build=app.match(/const BUILD = "([^"]+)"/)?.[1];
  assert.ok(build);
  assert.ok(html.includes("assets/app.js?v="+build));
});

test("native section picker mirrors all planner sidebar views",()=>{
  const select=html.slice(html.indexOf('id="planner-mobile-section"'));
  const options=[...select.split("</select>")[0].matchAll(/<option value="([^"]+)"/g)].map(x=>x[1]);
  const sidebar=[...html.matchAll(/data-planner-view="([^"]+)"/g)].map(x=>x[1]);
  assert.deepEqual(options,plannerViews);
  assert.deepEqual(sidebar,plannerViews);
  assert.ok(mobile.includes(".planner-sidebar{display:none!important}"));
  assert.ok(mobile.includes(".planner-mobile-section-picker{"));
});

test("section changes, selected state and role filtering stay synchronized",()=>{
  assert.ok(planner.includes('document.getElementById("planner-mobile-section")?.addEventListener("change"'));
  assert.ok(planner.includes("if(mobileSelector && mobileSelector.value!==view) mobileSelector.value=view"));
  assert.ok(planner.includes("option.hidden=restricted"));
  assert.ok(planner.includes("option.disabled=restricted"));
  assert.ok(planner.includes('button.setAttribute("aria-current","page")'));
  assert.ok(planner.includes('button.removeAttribute("aria-current")'));
});

test("mobile planner has readable fields and compact dashboard cards",()=>{
  assert.ok(mobile.includes("font-size:16px!important"),"inputs should not trigger iOS zoom");
  assert.ok(mobile.includes("grid-template-columns:repeat(2,minmax(0,1fr))!important"));
  assert.ok(mobile.includes(".planner-metric strong{"));
  assert.ok(mobile.includes("white-space:normal!important"));
  assert.ok(mobile.includes("#planner-import:disabled"));
  assert.ok(mobile.includes("#planner-reset:disabled"));
  assert.ok(mobile.includes(".planner-table-wrap{"));
  assert.ok(mobile.includes("overflow-x:auto"));
});

test("all site sections have mobile layout safeguards and camera remains full screen",()=>{
  for(const selector of [".home-hero",".venue-journey",".camera-gate-wrap",".system-card",".project-state",".planner-workspace"])
    assert.ok(mobile.includes(selector),selector);
  assert.ok(mobile.includes("body.camera-session-active{padding-bottom:0!important}"));
  assert.ok(mobile.includes("body.camera-session-active .site-header{display:none!important}"));
  assert.ok(mobile.includes("(orientation:landscape) and (pointer:coarse)"));
  assert.equal((mobile.match(/{/g)||[]).length,(mobile.match(/}/g)||[]).length);
});
