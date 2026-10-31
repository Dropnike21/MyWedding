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
