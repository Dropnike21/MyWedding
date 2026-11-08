# Mobile layout review — Home, Planning Studio, Guest Camera, and Guide

This update is intended to correct navigation and readability problems visible on small Android screens without changing Firebase data or the full-screen camera geometry. CSS overrides live in `assets/mobile-layout.css`, loaded after the spring theme.

## Information architecture

- **One primary navigation:** the previously fixed bottom navigation now sits as four compact tabs directly below the A&J brand in the top header. It stays reachable on scroll without covering cards, forms, or the browser's gesture indicator.
- **Planning Studio sections:** the wide horizontal section rail is replaced by an accessible `<select>` on mobile. It includes all eleven planner sections; options not authorized for a coordinator/finance role are disabled and hidden. Desktop retains the existing sidebar.
- **Planning account header:** the wedding title/date, Firebase sync indicator, and helper text stack in a readable order. In Firebase mode, disabled demo/import buttons disappear; Export backup and Sign out remain available.
- **Planner content:** two-column KPI cards use responsive values, headings wrap, action buttons have 44px touch targets, editing forms use 16px input type to avoid Safari zoom, and long tables scroll **inside their own containers** rather than stretching the whole page.
- **Home:** condensed hero copy and illustration, compact wedding facts, and smaller venue/map/immersive blocks.
- **Guest Camera:** only gateway elements and surrounding navigation are changed. The active full-screen shutter, film strip, orientation UI, and live preview rules are kept separate from this patch.
- **Guide:** more readable single-column process cards and project information.

## Manual device checks before final sign-off

### Navigation, scroll and responsiveness
1. At 320, 360, 390, 430, 768 CSS-pixel widths, check the logo, four tabs, safe-area padding, and **absence of a floating bottom bar**.
2. Scroll each page. The top navigation must remain reachable without covering form fields. No entire-page horizontal scrollbar should appear.
3. Rotate a phone landscape. On touch screens, the Home hero may become a side-by-side copy/photo composition; the camera must still use its own full-screen landscape layout.

### Planning Studio
1. Use both organizer roles with appropriate test accounts. The section picker should show only sections that role may access. Switching sections must update the displayed content; desktop side navigation must still work.
2. Ensure **Export backup** and **Sign out** remain visible in Firebase mode; disabled demo controls should not crowd the page.
3. Check dashboard money values, long guest names, supplier details, financial tables, expense editing, date inputs, and form validation.
4. Test a save and a refresh **after Firebase Sync confirms**. This patch does not change Firestore rules or implement live multi-device subscriptions.

### Home, Camera and Guide
1. Scroll Home through the song card, venue map, hero photo, wedding facts and footer.
2. Open Guest Camera in portrait and landscape. Confirm the camera controls, film strip, and shutter stay exactly as before. Return to Home; the video stream should stop.
3. Open How It Works and check all explanatory cards and links at 320px and landscape.
4. Use text zoom or larger font settings and confirm important controls still have room to wrap.

## Wedding details alignment

The couple confirmed **December 23, 2027 (tentative)** as the working wedding date. The outdated February banner was removed. Public dates and venue now use a minimal Firestore projection with a December fallback, while private planning records remain protected. See `docs/public-wedding-details.md` for the deployment steps.

## Automated checks

```bash
node --test tests/mobile-layout.test.mjs tests/camera.test.mjs tests/mobile-performance.test.mjs tests/planner-owner-access.test.mjs
```

These are source/logic regressions, not measured screenshots, real-phone interaction tests, or Firestore integration tests.
