# Springtime Pastels · MyWedding theme

## Reference colors

The color samples were taken from the four circles in the supplied wedding mood board. Primary surfaces and CTAs use powder blue and butter yellow; dark slate is the contrast foundation. Pink and sage remain supporting accents.

| Role | Token | Hex | Typical use |
|---|---|---|---|
| Primary blue | `--spring-blue` | `#B3BFCB` | Navigation selection, planner highlights, framing UI |
| Primary yellow | `--spring-yellow` | `#EAD88C` | Primary buttons, shutter, selected controls, highlights |
| Secondary dark | `--spring-slate` | `#283845` | Header bar, planner sidebar, footer, camera panels |
| Supporting blush | `--spring-pink` | `#EAB3B0` | Soft decorative touches |
| Supporting sage | `--spring-sage` | `#A2B188` | Small botanical accents |
| Pale background | `--bg` | `#EDF2F6` | Main surfaces |
| Dark text | `--spring-ink` | `#243443` | Body headings, labels, text |

## Implementation

The project loads `assets/theme-spring-pastels.css` **after** `assets/styles.css`. This separate override layer keeps recent camera orientation, film strip, effects and touch mechanics intact, and can be revised independently. The HTML theme-color meta tag matches the pale blue background.

Light content regions use slate text on pale blue, ivory or yellow. Camera shooting remains dark with slate panels and soft yellow controls to protect preview legibility. The actual camera video and captured-photo processing are intentionally **not recolored**: the wedding palette applies to the interface, not guests' photos. Semantic error/success statuses retain their red/green indications.

## Validation and device review

Run `node --test tests/camera.test.mjs tests/theme.test.mjs`. Color contrast for core text/background pairs is checked against WCAG AA normal-text threshold (4.5:1).

Before considering the visual QA complete:
1. On desktop and mobile, check the home hero, navigation, venue details, Guest Camera access form and Planner sidebar.
2. Confirm buttons remain readable and the selected Planner navigation has dark text on powder blue.
3. In portrait/landscape camera mode, confirm the hanging film layout and tools still work and that camera preview colors remain accurate.
4. Test status error and success banners; the palette must not hide warnings or mislabel save failures.
5. Verify keyboard focus rings and mobile browser top-bar color.
