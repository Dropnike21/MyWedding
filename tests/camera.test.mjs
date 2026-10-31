import { readFileSync } from "node:fs";
import { Script, runInNewContext } from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";

const app = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../assets/styles.css", import.meta.url), "utf8");

test("camera JavaScript parses", () => {
  assert.doesNotThrow(() => new Script(app));
});

test("new camera controls are present with unique IDs", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const id of [
    "camera-framing-guide", "camera-rotate", "camera-depth-overlay",
    "camera-aspect-options", "camera-temperature", "camera-focus-distance",
    "camera-focus-auto", "camera-beauty", "camera-aperture"
  ]) {
    assert.ok(ids.includes(id), id + " is missing");
  }
});

test("CSS rule block delimiters are balanced", () => {
  assert.equal((styles.match(/{/g) || []).length, (styles.match(/}/g) || []).length);
});

const begin = app.indexOf("  function captureGeometry(video) {");
const end = app.indexOf("\n  function drawWatermark(", begin);
assert.ok(begin >= 0 && end > begin, "captureGeometry function must exist");
const geometryBody = app.slice(begin, end);
const factory = runInNewContext(
  "(function(camera, isCameraLandscape) {\n" + geometryBody +
  "\nreturn captureGeometry;\n})"
);

for (const aspect of ["4:3", "1:1", "16:9"]) {
  for (const landscape of [false, true]) {
    test("photo crop matches " + aspect + " in " +
      (landscape ? "landscape" : "portrait"), () => {
      const camera = { aspectRatio: aspect, hardwareZoom: false, digitalZoom: 1 };
      const captureGeometry = factory(camera, () => landscape);
      const photo = captureGeometry({ videoWidth: 1920, videoHeight: 1080 });
      const base = aspect === "4:3" ? 4/3 : aspect === "16:9" ? 16/9 : 1;
      const ratio = landscape ? base : 1/base;
      assert.ok(Math.abs(photo.width/photo.height - ratio) < 0.002);
      assert.ok(photo.width <= 2400 && photo.height <= 2400);
      assert.ok(photo.sx >= 0 && photo.sy >= 0);
      assert.ok(photo.sx + photo.sw <= 1920 && photo.sy + photo.sh <= 1080);
    });
  }
}

test("camera pass name precedes the change-code action in both layouts", () => {
  const groupStart=html.indexOf('<div class="camera-bottom-identity">');
  const groupEnd=html.indexOf('<div class="camera-capture-deck">',groupStart);
  assert.ok(groupStart >= 0 && groupEnd > groupStart);
  const identity=html.slice(groupStart,groupEnd);
  assert.ok(identity.indexOf('class="camera-current-guest"') <
    identity.indexOf('id="camera-change-code"'));
});

test("portrait tools are vertical and landscape tools are horizontal on top", () => {
  assert.match(styles,/camera-session:not\(\.is-landscape\) \.camera-action-rail\{[\s\S]*?flex-direction:column!important/);
  assert.match(styles,/camera-session\.is-landscape \.camera-action-rail\{[\s\S]*?flex-direction:row!important/);
  assert.match(styles,/camera-session\.is-landscape \.camera-action-rail\{[\s\S]*?top:8px!important/);
});

test("landscape film hangs vertically with rotated thumbnails", () => {
  assert.match(styles,/camera-session\.is-landscape \.camera-film-track\{[\s\S]*?flex-direction:column!important/);
  assert.match(styles,/camera-session\.is-landscape \.camera-film-frame \.camera-film-image\{[\s\S]*?rotate\(90deg\)/);
  assert.match(app,/function isFilmVertical\(\)/);
  assert.match(app,/const vertical=isFilmVertical\(\)/);
});

test("film capacity is measured on the active orientation axis", () => {
  const first=app.indexOf("  function maxVisibleFilmFrames(");
  const last=app.indexOf("\n  function clearFilm(",first);
  assert.ok(first >= 0 && last > first);
  const create=runInNewContext(
    "(function(camera,isFilmVertical) {\n" + app.slice(first,last) +
    "\nreturn maxVisibleFilmFrames;\n})"
  );
  const mock={
    filmTrack:{clientWidth:320,clientHeight:160},
    filmEmpty:{offsetWidth:38,offsetHeight:31}
  };
  assert.equal(create(mock,()=>false)(36),6);
  assert.equal(create(mock,()=>true)(36),3);
});

test("tapping outside camera tools dismisses them but inside taps do not", () => {
  const first=app.indexOf("  function dismissCameraPanelsOnOutsidePointer(");
  const last=app.indexOf("\n  function stopStream(",first);
  assert.ok(first >= 0 && last > first);
  class UIElement {
    constructor(children=[]) {this.children=children}
    contains(other) {return this===other || this.children.includes(other)}
  }
  const inside=new UIElement();
  const outside=new UIElement();
  const camera={
    session:{hidden:false},
    railOpen:true,
    railToggle:new UIElement(),
    quickTools:new UIElement([inside]),
    effectsPanel:Object.assign(new UIElement(),{hidden:true})
  };
  const calls=[];
  const dismiss=runInNewContext(
    "(function(camera,setRail,Element) {\n" + app.slice(first,last) +
    "\nreturn dismissCameraPanelsOnOutsidePointer;\n})"
  )(camera,open=>{calls.push(open);camera.railOpen=open},UIElement);
  dismiss({target:inside});
  assert.equal(calls.length,0);
  dismiss({target:outside});
  assert.deepEqual(calls,[false]);
});
