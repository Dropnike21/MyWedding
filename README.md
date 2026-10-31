# MyWedding

A public-facing wedding website and future wedding-management system for Angela & Joseph.

**Wedding date:** February 23, 2027 (tentative)  
**Project stage:** Static frontend prototype. No production Firebase connection is configured.

## What's here now

- Responsive public wedding landing page and countdown
- Planning Studio design preview (**no live private data**)
- Browser camera **local demo**: take a photo and save it to your own device
- Architecture overview for Firebase and Google Sheets

**Important:** The camera currently does not upload, store, or publish photographs. RSVP, admin login, private planning records, QR admission, photo moderation, and the 48-hour gallery lock are not live.

## Deploy with GitHub Pages

This project currently uses standard HTML, CSS and JavaScript, so there is **no build command** or Node.js dependency.

1. Open the repository's **Settings → Pages** section.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Choose branch `main`, folder `/(root)`, and save.
4. Wait for GitHub Pages to report a successful publication. The expected URL is `https://dropnike21.github.io/MyWedding/`; check that GitHub actually reports it as live.

Each subsequent commit to `main` will publish the updated static files. Keep this repository public only if you are comfortable publishing its frontend source.

## Proposed production architecture

```
GitHub Pages (public static frontend)
    |
    +-- Firebase Authentication (private admin sessions)
    +-- Firestore (guest records, RSVP, suppliers, budgets, tasks)
    +-- Firebase Storage (private wedding images)
    +-- Server-side Cloud Functions
             +-- access tokens and event-window enforcement
             +-- delayed gallery release / moderation
             +-- automatic Firestore → Google Sheets mirror
             +-- sync logs, retries and recovery
```

### Security & privacy requirements

- Never put actual guest names, phone numbers, payments, wedding documents, or private photo URLs in this public GitHub repo.
- Never commit Firebase service account keys or Google API private keys.
- Firebase **web client configuration** is not a secret by itself; security is provided by Firebase Authentication, Firestore/Storage security rules and server-side authorization.
- Protect backend access with explicit rules; do **not** treat hiding an admin button as authentication.
- The photo embargo must be enforced with server-side authorization, not only a page countdown. The upload window must also be validated server-side (Asia/Manila).
- Deploy a separate test environment before using the system with real wedding guests.
- Google Sheets is a **read-only reporting mirror** for humans, not a substitute for scheduled independent data/photo backups.

### Budget note

GitHub Pages can host this public static frontend on a free public repository. Firebase Cloud Storage now requires the **Blaze pay-as-you-go** plan for access, although no-cost usage allowances may apply. Enable budget alerts and upload limits before testing with many guest photographs.

## Suggested development phases

1. Firebase project, admin login, production security rules, and Firestore data model.
2. Connected planning dashboard: guests/RSVP, budget, suppliers, payments, checklist.
3. Secure one-way Firestore → Google Sheets reporting sync with retries.
4. Guest invitation and RSVP portal.
5. QR camera, private uploads, moderation, event access rules and delayed gallery release.
6. Load testing, Android/iOS camera testing, and a full rehearsal before the event.

The existing Google Sheet can remain untouched as a reference until validated migration and backups are complete.
