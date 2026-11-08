# Wedding Camera QA — fixed portrait interface

The wedding camera is intentionally **portrait-only**. It does not read
device-orientation sensors, add a Rotate button or switch to landscape film /
tool layouts. If Android/iOS rotates the browser viewport, the portrait
camera remains centered and the page can scroll to the shutter.

## Phone-camera feature checks

1. Open the sample invitation design at
   `https://dropnike21.github.io/MyWedding/#camera/AJ27TEST`. It opens a
   guest-facing arrival screen; no camera or code verification should begin
   until the guest taps **Open your wedding camera**.
2. Test on Android Chrome and iPhone Safari at ordinary phone width. Check
   that the camera controls expand **vertically** beside the preview, the
   **film strip stays horizontal**, and the shutter is fully accessible.
3. Turn the device sideways and verify that the old landscape interface
   **does not appear**. The webpage cannot lock OS rotation, so a sideways
   browser viewport may require scrolling. The tool rail stays vertical.
4. Open the camera and grant permission. Test front/back switch, focus,
   exposure, zoom, flash (if supported), timer and filter selection.
5. Capture 4:3, 1:1 and 16:9 framing. These are photographic crop formats
   within the portrait UI, not alternate camera screen orientations.
6. Test Beautify, Portrait Blur and the warm/cool adjustment. These are
   software approximations; the saved edited photo may differ from the
   lower-cost live preview.
7. Expand Effects, tap outside to close it, and ensure camera controls are
   still usable on short phone screens. Exit to Home and confirm the camera
   stream stops.
8. Verify the watermark uses the published wedding date (default Dec 23,
   2027), not the previously hardcoded Feb 23 watermark.
9. Run the **full real-upload rehearsal** only after deploying Firebase
   Functions and Drive credentials, following
   [End-to-end camera rehearsal](camera-rehearsal-end-to-end.md).

## Automated checks

```sh
node --test tests/camera.test.mjs tests/camera-rehearsal.test.mjs
```

Source tests cover camera geometry, UI and invitation wiring, but cannot
measure live phone framerate or prove external Drive delivery. The rehearsal
is the production-like integration test. The actual wedding-day camera remains
disabled until owners approve release.
