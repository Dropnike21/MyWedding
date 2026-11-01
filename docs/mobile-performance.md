# Mobile performance pass — homepage and guest camera

This pass targets Android Chrome and other touch/mobile browsers. Its main objective is to avoid expensive continuous paint work while preserving wedding branding and functional photo capture.

## Changes

### Guest camera
- Requests a mobile camera stream around **1280×960 at 24 fps** (device may negotiate a different size). Desktop requests 1920×1440 at 30 fps. This is a **photo-resolution tradeoff** on phones: JPEGs are rendered from the camera stream, so lower stream resolution can reduce print detail.
- The Natural look now sends **`filter: none`** to the video instead of `brightness(1.000)`. This avoids allocating a GPU filter layer when no look is selected.
- The beauty look keeps its gentle tone and contrast on mobile, but the **live mobile preview omits CSS Gaussian blur**; the saved wedding JPEG retains the selected beauty effect.
- The portrait depth preview uses a cheap tinted vignette rather than a live backdrop-blur. The **saved JPEG still gets the configured portrait/background blur**. Compare the captured result rather than assuming the preview is pixel-accurate.
- Coalesces hardware zoom and exposure updates to at most about once per 80 ms; stale drag positions are skipped rather than queued for the camera track. Camera tilt sensors are sampled less frequently.
- Suppresses live thumbnail previews in the filter picker on mobile and removes the large flying-thumbnail animation; the film strip, photo count, clean original, and edited wedding JPEG remain.

### Homepage
- Reduces decorative petal/heart DOM elements on mobile, hides their continuously animated layer on phones, and stops constant hero sheen/moon/ring animations on touch/small screens.
- Removes blur-heavy sticky headers and frosted panels on phones, keeping opaque colors and the established wedding palette.
- Removes mobile scroll-reveal animation observers while showing their content immediately.
- Defers the venue map/media loading until nearer the viewport and throttles user-enabled hero/venue device-tilt updates.
- Pauses ambient decoration when the page is hidden or switched away from Home.

## Checks

From repository root:

```sh
node --test tests/camera.test.mjs tests/mobile-performance.test.mjs
```

Source-level tests cover camera crop geometry, orientation film/tool logic, gesture coalescing, the default unfiltered camera path, stream constraints, and mobile/home CSS safeguards.

## Android / iOS acceptance

1. On the **Home** view, scroll from hero to song, map and venue, then back to the top. Compare smoothness with the previous deployment. Observe whether the map initializes only as you approach it.
2. Visit the **Guest Camera** from Home. Open the rear camera in **Natural** with Beautify and Portrait Blur set to **Off**; check preview smoothness at rest, then when panning the phone.
3. Try pinch zoom, vertical exposure adjustment, tap focus, switch cameras, and photo capture. Confirm touch controls still work and do not queue a long backlog of delayed adjustments.
4. Turn on Beautify or Portrait Blur, take a picture, and examine the **captured** JPEG. The effects are intentionally lighter in the **live preview** on mobile, but remain in the edited capture.
5. Rotate between portrait/landscape, open/close the tool rail, tap outside to dismiss, and inspect the vertical hanging film strip and camera-pass details.
6. Return Home, then navigate away and back; ensure no camera feed remains active and the page does not visibly stutter.
7. Repeat on a weaker/older phone if available. Use Chrome's Performance tools or Android's FPS diagnostics for measured frame rates; these source tests are not hardware benchmarks.

**Limitations:** The browser may ignore ideal camera constraints. Actual performance, image resolution, and canvas filter availability vary by device. If larger saved photos are more important than live smoothness, consider a future high-resolution capture option separated from the preview stream.
