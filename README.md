# MyWedding

A public-facing wedding website and future wedding-management system for Angela & Joseph.

**Wedding date:** February 23, 2027 (tentative)  
**Project stage:** Frontend and secure callable-function source committed. Firestore exists, but guest access, admin roles and Cloud Functions have **not** been deployed or activated.

## What's here now

- Responsive public wedding landing page and countdown
- Responsive private invitation-management UI (sign-in, create/edit/list, rotate/revoke) behind a currently disabled backend
- Browser camera **local demo**: take a photo and save it to your own device
- Architecture overview for Firebase, private Google Drive photos, and Google Sheets
- Firebase client configuration, App Check helper, code redemption and guest RSVP client interface
- Cloud Functions source for code issuance, atomic rotation/revocation, RSVP and session validation (**not deployed**)

**Important:** The camera currently does not upload, store, or publish photographs. Invitation-code verification, live RSVP, admin database access, QR issuance, photo moderation, and the 48-hour gallery lock are **not live**. The current page may show a local-only device-camera demo; it never uploads.

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
    +-- Server-side Cloud Functions / trusted API
             +-- event-window enforcement and upload limits
             +-- owner-authorized Google Drive OAuth connection
             +-- private Drive uploads and gallery permission checks
             +-- delayed gallery release / moderation
             +-- automatic Firestore → Google Sheets mirror
             +-- sync logs, retries and recovery
```

### Security & privacy requirements

- Never put actual guest names, phone numbers, payments, wedding documents, or private photo URLs in this public GitHub repo.
- Never commit Firebase service account keys or Google API private keys.
- Firebase **web client configuration** is not a secret by itself; security is provided by Firebase Authentication, Firestore/Storage security rules and server-side authorization.
- Protect backend access with explicit rules; do **not** treat hiding an admin button as authentication.
- Photos are held in private Google Drive folders and accessed by a server-side Google OAuth connection; the school-managed Workspace administrator may block access to third-party OAuth apps.
- Never commit OAuth client secrets, refresh tokens, or service account credentials. They belong only in backend secret storage.
- The photo embargo must be enforced with server-side authorization, not only a page countdown. The upload window must also be validated server-side (Asia/Manila).
- Deploy a separate test environment before using the system with real wedding guests.
- Google Sheets is a **read-only reporting mirror** for humans, not a substitute for scheduled independent data/photo backups.

### Budget note

GitHub Pages can host this public static frontend on a free public repository. Google Drive provides the proposed image storage, subject to the owner account’s verified quota and administrator policies. Firebase backend functions may still require Blaze billing; configure budgets, rate limits, and upload size limits. A school-managed Drive account must not be the only irreplaceable archive.

## Wedding Studio local demo

The Planning Studio is now a functional local-demo wedding planner. It stores test records only in the current browser and does not require Firestore access. It includes event setup, guest/RSVP management, suppliers, budget allocations, payments, checklist tasks, wedding-day timeline, decisions, coordinator/team records, archive/restore, and JSON export/import.

Use fictional/test data until Firebase organizer authentication and protected planning APIs are deployed. See **[Wedding Studio testing guide](docs/planner-testing.md)**.

## Suggested development phases

1. Firestore project created; secure admin Auth setup, custom claims, App Check, and Cloud Functions deployment remain.
2. Connected planning dashboard: guests/RSVP, budget, suppliers, payments, checklist.
3. Secure one-way Firestore → Google Sheets reporting sync with retries.
4. Guest invitation/RSVP frontend implemented; complete staging tests before enabling.
5. Confirm Workspace OAuth access, connect a private Drive folder via backend credentials, then implement QR uploads, moderation, event access rules, and delayed gallery release.
6. Load testing, Android/iOS camera testing, and a full rehearsal before the event.

The existing Google Sheet can remain untouched as a reference until validated migration and backups are complete.


## Invitation access and regeneration (work in progress)

The guest portal supports an eight-character invitation code that can be filled automatically from a private link. A verified guest can RSVP for an individual or family invitation. The **Wedding Studio** has a searchable organizer invitation list, forms to edit RSVP/details, and **Regenerate link** / **Revoke access** controls.

The backend implements `createInvitation`, `listInvitations`, `updateInvitation`, `rotateInvitation`, `revokeInvitation`, `redeemInvitation`, `respondToInvitation`, and `checkGuestSession`.

**Link regeneration is atomic:** Firestore deletes the old code lookup, issues a new code and increments the invitation's version together. Previously redeemed sessions no longer match that version. Saved guest and RSVP records remain intact. Future photo endpoints must re-check the current version on every upload.

Raw codes are returned once to an authorized organizer and are **never stored in plaintext** in Firestore. Do not paste actual invitation URLs into public GitHub issues.

All live Firebase calls are currently disabled in `assets/guest-config.js` until you configure Authentication, Enterprise App Check, Cloud Functions and admin roles. Please do **not** enable the switch until these services have been deployed and tested.

For architecture, Firebase configuration, organizer claims, rate limiting, and a staged testing checklist, see **[Secure guest access setup](docs/guest-access.md)**.

### Pending features

- Secure Google Drive photo upload and 24/48-hour locked gallery
- QR image generation/print layouts for unique invitations
- Supplier, payment, budget and task management forms
- Automatic Firestore → private Google Sheets reporting mirror
- Production deployment, Android/iPhone testing and accessibility rehearsal

The current production/database state has not been verified by a live Firebase connection from ChatGPT. Deploying or modifying Google Cloud IAM permissions requires explicit action in your Firebase/Google accounts.
