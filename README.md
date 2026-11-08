# MyWedding

A public-facing wedding website and future wedding-management system for Angela & Joseph.

**Wedding date:** December 23, 2027 (tentative)  
**Project stage:** Firebase-connected Wedding Studio and source code for
real guest invitation links, owner-controlled camera access and secure Drive
photo uploads. Firebase Cloud Functions and Drive OAuth still need production
deployment and end-to-end verification.

## What's available

- Responsive public wedding site with Firebase-backed safe wedding details.
- Private organizer Planning Studio with guests, RSVP, budget, suppliers and tasks.
- Genuine per-invitation links: **Guests & RSVPs → Invitations & photo cleanup**.
- Guest-facing invitation landing page displaying party name and allotted seats
  after secure code verification.
- Portrait-only camera with RAW and edited JPEG uploads, shared server-side
  frame quota and owner-managed access (no fixed time limit).
- An explicit **Delete guest & photos** action: revoke code, remove the
  invitation and guest record, both Drive images, Firestore metadata and Sheet
  audit rows. Cleanup must succeed before deletion is reported complete.
- One code per invitation currently; unique codes for individual seats are
  still a separate future enhancement.

**Important:** All actual uploads depend on Firebase Functions, App Check,
anonymous auth and private Google Drive OAuth. GitHub Pages updates alone do
not deploy those services. Do not send guest invitations before a successful
end-to-end upload check.

See [Normal guest invitation, camera and photo cleanup](docs/guest-invitation-live-flow.md).
There is no one-hour rehearsal or temporary guest mode. Create your own
ordinary guest record to test, then delete it using the owner cleanup action.

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

Real guest verification and upload calls are enabled in the frontend, but require deployed Cloud Functions, App Check, anonymous Auth, and private Drive OAuth. No upload is considered successful before server confirmation.

For architecture, Firebase configuration, organizer claims, rate limiting, and a staged testing checklist, see **[Secure guest access setup](docs/guest-access.md)**.

### Pending features

- Deploy and verify secure Google Drive photo uploads; build the 24/48-hour locked gallery
- QR image generation/print layouts for unique invitations
- Expand individual-per-seat guest links and RSVP handling
- Automatic Firestore → private Google Sheets reporting mirror
- Production deployment, Android/iPhone testing and accessibility rehearsal

The current production/database state has not been verified by a live Firebase connection from ChatGPT. Deploying or modifying Google Cloud IAM permissions requires explicit action in your Firebase/Google accounts.


## Public wedding date and invitation design

The working wedding date is **December 23, 2027 (tentative)**. The public
Home page now gets its date, countdown and venue name from a narrow Firestore
`publicWeddingDetails/current` projection, with a December fallback before
that record is published. The private `weddings/main` record remains
organizer-only. After merging the website change, **publish the updated
Firestore rules and open Planning Studio as an owner** to initialize the public
record. See [Public wedding details](docs/public-wedding-details.md).

Per-seat invitation codes and simultaneous multi-device access are designed
in [Seat codes and concurrency](docs/seat-codes-concurrency.md), but are **not
yet deployed**. The guest camera's public preview remains local and does not
provide production server-side quota synchronization.

## Firebase planner connection

The Wedding Studio now has a Firestore adapter and role-based Security Rules. It uses Google Authentication + App Check + Firestore directly for planning CRUD, while invitation and camera security remain server-only.

The Firebase planner switch is enabled, but the public reCAPTCHA Enterprise **site key is intentionally blank**. Add it and publish the new Firestore rules before testing live planning data.

See **[Firebase planner setup and organizer bootstrap](docs/firebase-planner-setup.md)**.
