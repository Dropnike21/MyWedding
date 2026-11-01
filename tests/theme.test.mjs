import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const base=readFileSync(new URL("../assets/styles.css",import.meta.url),"utf8");
const theme=readFileSync(new URL("../assets/theme-spring-pastels.css",import.meta.url),"utf8");

function luminance(hex){
  const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
    .map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4);
  return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];
}
function contrast(foreground,background){
  const a=luminance(foreground),b=luminance(background);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}

test("theme stylesheet loads after the existing camera/planner CSS",()=>{
  const original=html.indexOf('href="./assets/styles.css?');
  const spring=html.indexOf('href="./assets/theme-spring-pastels.css?');
  assert.ok(original>=0 && spring>original);
  assert.match(html,/<meta name="theme-color" content="#edf2f6"/);
});

test("reference spring swatches and dark contrast token exist",()=>{
  for(const hex of ["#b3bfcb","#ead88c","#eab3b0","#a2b188","#283845"]){
    assert.ok(theme.includes(hex),hex+" missing from theme");
  }
});

test("main text/background pairs meet WCAG AA normal-text contrast",()=>{
  const pairs=[
    ["#283845","#ead88c"],
    ["#283845","#b3bfcb"],
    ["#283845","#fffef9"],
    ["#fffef9","#283845"],
    ["#586774","#edf2f6"],
    ["#ead88c","#283845"],
    ["#826b29","#fffef9"]
  ];
  for(const [foreground,background] of pairs)
    assert.ok(contrast(foreground,background)>=4.5,
      foreground+" / "+background+" failed contrast");
});

test("theme covers navigation, planner, gate, and camera without layout rewrites",()=>{
  for(const selector of [
    ".home-hero",".main-nav button",".planner-sidebar",".planner-nav.active",
    ".camera-gate-wrap",".camera-session-bottom",".camera-rail-button",
    ".camera-sheet",".camera-film",".camera-shutter>span",".project-state",
    "footer"
  ]) assert.ok(theme.includes(selector),selector+" is absent");
  assert.ok(base.includes("camera-session.is-landscape"),
    "existing landscape camera layout should remain available");
});

test("theme preserves semantic success/error status classes",()=>{
  assert.ok(theme.includes("Preserve success and error semantics"));
  assert.ok(!theme.includes(".invitation-status.is-error{"));
  assert.ok(!theme.includes(".planner-status-no{"));
});

test("CSS delimiters are balanced in both files",()=>{
  for(const text of [base,theme])
    assert.equal((text.match(/{/g)||[]).length,(text.match(/}/g)||[]).length);
});
