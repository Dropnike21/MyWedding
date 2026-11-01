import { readFileSync } from "node:fs";
import { runInNewContext, Script } from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";

const app=readFileSync(new URL("../assets/app.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../assets/styles.css",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");

function extracted(name,next) {
  const from=app.indexOf(name), to=app.indexOf(next,from);
  assert.ok(from>=0 && to>from,name+" was not found");
  return app.slice(from,to);
}

test("optimized JavaScript parses and CSS blocks remain balanced",()=>{
  assert.doesNotThrow(()=>new Script(app));
  assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
  assert.match(html,/20261101-perf1/);
});

test("natural mobile camera preview does not use a video filter layer",()=>{
  const body=extracted("  function combinedPreviewFilter(", "  function updateVideoPresentation(");
  const get=runInNewContext("(function(camera,CAMERA_FILTERS,mobilePerformance){"+
    body+";return combinedPreviewFilter;})");
  const camera={
    filter:"natural",hardwareExposure:false,exposureValue:0,
    beautyStrength:0,hardwareWhiteBalance:false,temperatureOffset:0
  };
  const fn=get(camera,{natural:{css:"none"}},true);
  assert.equal(fn({preview:true}),"none");
  camera.beautyStrength=50;
  assert.doesNotMatch(fn({preview:true}),/blur\(/);
  assert.match(fn({preview:false}),/blur\(/);
});

test("mobile camera requests a lower frame-rate and 1280 px stream",()=>{
  const body=extracted("  function cameraConstraints(", "  async function configureTrackCapabilities(");
  const get=runInNewContext("(function(camera,mobilePerformance){"+
    body+";return cameraConstraints;})");
  const mobile=get({facingMode:"environment"},true)();
  const desktop=get({facingMode:"environment"},false)();
  assert.equal(mobile.video.width.ideal,1280);
  assert.equal(mobile.video.frameRate.ideal,24);
  assert.equal(mobile.video.frameRate.max,30);
  assert.ok(desktop.video.width.ideal>mobile.video.width.ideal);
});

test("gesture queue coalesces rapid pointer updates and can cancel work",async()=>{
  const body=extracted("  const cameraGestures = {","  function clamp(");
  const make=runInNewContext(
    "(function(camera,performance,setTimeout,clearTimeout,setCameraZoom,setCameraExposure){"+
    body+";return {queueCameraGesture,clearCameraGestureQueue,cameraGestures};})"
  );
  const timers=new Map();
  const received=[];
  let id=0;
  const queue=make({stream:{}},{now:()=>0},
    (fn,delay)=>{const key=++id;timers.set(key,{fn,delay});return key;},
    key=>timers.delete(key),
    async x=>{received.push(["zoom",x]);},
    async x=>{received.push(["exposure",x]);}
  );
  queue.queueCameraGesture("zoom",1.2);
  queue.queueCameraGesture("zoom",1.5);
  queue.queueCameraGesture("zoom",2);
  assert.equal(timers.size,1);
  const [key,timer]=[...timers.entries()][0];
  assert.ok(timer.delay>=0);
  timers.delete(key);
  await timer.fn();
  assert.deepEqual(received,[["zoom",2]]);
  queue.queueCameraGesture("exposure",.6);
  assert.equal(timers.size,1);
  queue.clearCameraGestureQueue();
  assert.equal(timers.size,0);
});

test("homepage reduces ambient work and does not animate offscreen views on mobile",()=>{
  assert.match(app,/petalCount = mobileAmbient \? 4 : 24/);
  assert.match(app,/heartCount = mobileAmbient \? 1 : 9/);
  assert.match(app,/revealObserver = motionOK && !mobilePerformance/);
  assert.match(app,/rootMargin: mobilePerformance \? "80px 0px"/);
  assert.match(css,/body:not\(\[data-active-view="home"\]\) \.ambient-layer/);
  assert.match(css,/\.ambient-layer\{display:none!important\}/);
});

test("mobile preview disables costly compositing but retains photo effects",()=>{
  assert.match(css,/\.camera-depth-overlay\{[\s\S]*?backdrop-filter:none!important/);
  assert.match(css,/\.camera-framing-guide\{[\s\S]*?box-shadow:0 0 0 1px/);
  assert.match(app,/if \(mobilePerformance\) addFilmFrame\(thumbnail,number\)/);
  assert.match(app,/combinedPreviewFilter\(\{preview:true\}\)/);
  assert.match(app,/context\.filter=combinedPreviewFilter\(\)/);
});
