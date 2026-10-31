# Wedding Camera: features and acceptance tests

## Included in this branch

- **Orientation:** mobile portrait/landscape layout reacts to viewport rotation. On browsers with device-orientation events, tilting an upright phone can rotate the interface even with system rotation lock. If blocked/unavailable, **Rotate** manually flips the interface; tap **Auto** to return.
- **Framing:** choose **4:3**, **1:1**, or **16:9**. The on-screen framed preview and the JPEG crop use the same orientation and aspect ratio. The image is capped at 2400 px along its longest side; a low-resolution stream is not upscaled.
- **Portrait effects:** adjustable **Soft beautify** uses gentle full-frame filter changes, not facial reshaping. **Portrait background blur** uses a feathered central focus area, not depth sensing or face/person segmentation.
- **White balance:** warm/cool software color adjustment. This is a look, not lens white-balance hardware control.
- **Focus and exposure:** tap-to-focus and exposure gestures where track constraints allow. A manual-focus slider is shown only if the current camera reports manual focus distance support. Pinch-to-zoom and a device-dependent torch remain.
- **Capture:** the clean original and the watermarked/effected wedding photo remain separate. In the current preview, Drive upload is still disabled.

## Run lightweight tests

```bash
node --test tests/camera.test.mjs
```

These static checks verify source syntax, controls in HTML and all six 4:3/1:1/16:9 crop orientations. They **do not** validate hardware behaviors or canvas output fidelity.

## Manual acceptance: Android Chrome and iPhone Safari

1. Open Guest Camera with the **preview/test invitation**, then tap **Open camera**. Grant camera permission. Check torch availability and front/rear switching.
2. Hold the phone normally, then turn it landscape with OS auto-rotate **enabled**. The interface should reflow, not clip the shutter or effects panel. Capture and inspect all three image aspect ratios.
3. Disable OS auto-rotate, turn the device sideways, and verify automatic sensor-assisted orientation where available. Otherwise tap **Rotate**. Try **Auto** to reset.
4. Tap different points in the preview, drag vertically for exposure, pinch to zoom, and try manual focus only if the slider appears.
5. Choose each aspect ratio and compare the central guide with the resulting image framing. Repeat for the selfie lens.
6. Under **Effects**, check filters, **Soft beautify** at 0 / 40 / 100, **Portrait background blur** at 0 / 40 / 100, and warm/cool white balance. The latter and beautify are intentionally subtle; blur is center-based, so put the subject near the center.
7. Check that panels remain scrollable in short landscape viewports, the shutter is reachable, and returning to the main site stops the camera stream.
8. Confirm that the preview camera does not claim a cloud upload. Before enabling production uploads, verify that the RAW original is unfiltered while the wedding image includes effects and the watermark, and test photo quota enforcement server-side.

## Camera layout review: portrait and landscape

- **Portrait:** tap the side handle to expand a vertical column of Flip, Rotate, Flash (when supported), Timer, and Effects buttons. Tap the live view, film, shutter, or camera-pass region outside the tool rail to close the rail and any open effects sheet. The Escape key also dismisses the controls.
- **Landscape:** the same controls expand horizontally at the top of the preview. The film remains beside the shutter in the side deck but hangs vertically, with sprocket holes on both sides and turned thumbnails. The film counter is above the strip; controls must never cover the shutter.
- **Camera-pass identity:** the label and current guest text stay together, left-aligned. **Change code** is a separate trailing button with a consistent baseline and minimum touch area. On narrower landscape screens, guest text may wrap to two lines.
- **Focus feedback:** tapping the preview shows the focus indicator briefly, then automatically hides it to keep the image clear.

### Device QA after these refinements

1. In portrait, open and close tools repeatedly. Confirm the expanded tools are **vertical**. Open Effects, tap outside, and verify **both** the tools and effects panel disappear. Confirm clicks inside a slider do **not** dismiss the panel.
2. In landscape, open the tools and confirm a **horizontal row at the top**. Check the film is a **vertical hanging strip beside the shutter** and that its photos rotate without rotating the frame count.
3. Take two photos while landscape is active, then rotate back and forth. Ensure the film count, thumbnails, and shutter are visible, without unintended overlap.
4. In portrait and landscape, confirm **CAMERA PASS / Camera Preview · Test Guest** stays associated with **Change code** and does not collide with the film label or shutter. Repeat with a long guest name.
5. Repeat at small landscape heights (about 320 CSS pixels), with auto-rotate on and off, and at high text-zoom settings.

## Browser limitations

Camera lens features are negotiated with `MediaStreamTrack.getCapabilities()` and `applyConstraints()`; available controls vary across phones and browsers. Screen-orientation locking is not consistently available to ordinary webpages, and device-orientation sensors may require permission or be blocked. The manual orientation control is retained as fallback.

Canvas 2D filters are not uniformly supported on all browsers. A device without canvas filter support may save less effect processing than the live CSS preview. Do not promise true optical aperture control, hardware beautification, semantic subject blur, or full-resolution native camera photos.
