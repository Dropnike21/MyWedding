# Secure invitation links, guest RSVP and regeneration

**Status:** Web interface and Cloud Functions are committed to GitHub; Firebase functions, authentication rules and App Check have NOT been deployed. No real invitation links can be issued on the public site yet. The current GitHub Pages website remains a frontend prototype with a local-only camera test.

## How invitations work

1. The organizer signs in with a Google account bearing a Firebase Auth **admin custom claim**.
2. In **Wedding Studio**, click **+ New**, enter the name/family, invited side, expected seats, and select **Create invitation**.
3. The backend generates a random eight-character code, e.g. \`7K2M-9R4P\` (example only).
4. It returns the code and link **once** to the admin screen for copying:
   \`https://dropnike21.github.io/MyWedding/#camera/7K2M-9R4P\`
5. The invitation holder taps the link or enters the printed code. Firebase signs them in anonymously *without a guest registration screen*. The server checks the code.
6. A verified guest or family can submit or revise one RSVP. Actual photo uploads are a later phase.
7. During the configured event window, a future protected camera upload endpoint will accept photos from valid sessions. The existing camera test never uploads.

The QR code can encode the exact personal link. Print the short code and a short website address beneath it for guests who cannot scan QR codes. No app installation is required.

## Regenerate and revoke

**Regenerate link** is the preferred response to a leaked or misplaced invitation.

- One invite/family has a **stable invitation ID** and a single **current** code.
- A new random code is generated on the server; Firestore **transactionally deletes** the old code lookup, adds the new one, updates the invitation and increments \`revision\`.
- The previous link is invalid. A previously redeemed guest session carries the earlier revision and is rejected by \`checkGuestSession\` and the RSVP endpoint.
- **Every future photo upload and gallery request MUST validate that revision again**; merely checking that the guest redeemed a code once is insufficient.
- A new link is displayed **once**. The raw code is not stored in Firestore; only a keyed HMAC digest is stored. If lost, regenerate.
- Any earlier RSVP remains on the invitation record. Only the camera and RSVP *access* are revoked, not the saved response or previously uploaded files.

**Revoke** disables the invitation and invalidates its code. You can issue a new code later with Regenerate/Issue a fresh link, without deleting the guest's historical details.

The old code cannot become valid through changing the RSVP, editing a name, or refreshing the page.

**Security limitations:** Invitation codes are bearer credentials: they can be shared or photographed. We enforce a random code alphabet, strong server-side keyed hashes, per-session/network attempt throttling, App Check, and revocation. We cannot guarantee that the person using the code is the named invitee. One family code intentionally works on several devices until revoked.

## Current Firestore model

All database writes currently go through Firebase Admin SDK in restricted Cloud Functions, not GitHub Pages client code.

| Collection / document | Contents | Access |
| --- | --- | --- |
| \`invitationRegistry/{id}\` | partyLabel, side, invitedSeats, confirmedSeats, rsvp, status, revision, codeDigest, notes, timestamps | Admin functions only; guest RSVP through restricted function |
| \`invitationCodes/{hmac(code)}\` | invitationId, revision, status | Trusted functions only |
| \`guestSessions/{anonymousAuthUID}\` | invitationId, revision, validUntil | Trusted functions only |
| \`invitationAttemptLimits/{digest}\` | short-lived brute-force counters | Trusted functions only |
| \`weddingSettings/camera\` | Firestore Timestamp \`openAt\`, \`closeAt\` | Trusted/admin only |

Firestore security rules in \`firestore.rules\` **deny all direct browser access**. This is intentional: browser access to guest names, budgets, RSVP data, codes, or sessions should not be public. It does not affect server-side Admin SDK usage.

### Deployed callable functions (once activated)

| Name | Who may call | Effect |
| --- | --- | --- |
| \`createInvitation\` | Admin custom claim | Creates invitation and returns one-time code |
| \`listInvitations\` | Admin custom claim | Private invitation list, **without codes** |
| \`updateInvitation\` | Admin custom claim | Updates non-code details only |
| \`rotateInvitation\` | Admin custom claim | Atomically replaces code, bumps revision |
| \`revokeInvitation\` | Admin custom claim | Deactivates code and bumps revision |
| \`redeemInvitation\` | Authenticated guest + App Check | Verifies current code and starts a versioned session |
| \`respondToInvitation\` | Guest with valid current session + App Check | Saves RSVP and attending seats |
| \`checkGuestSession\` | Guest with valid current session + App Check | Checks revision and current camera window |

**Not implemented:** secure Google Drive uploads, QR image generation, photo moderation, 48-hour release, backups, or live Google Sheets sync.

## Deployment prerequisites

The screenshot confirms the Firestore database exists. The following items are still required.

1. **Review Firestore > Rules in the Firebase console**. Ensure the live database is not in test mode or publicly writable. The deny-all \`firestore.rules\` file in GitHub is *not active* until deployed. Deploying it replaces existing Firestore rules; review first.
2. In **Authentication > Sign-in method**, enable **Google** (organizers) and **Anonymous** (guests). Enter the Firebase Authorized Domain \`dropnike21.github.io\` under Authentication settings.
3. In **App Check**, configure reCAPTCHA **Enterprise** for the web app with an authorized site/domain \`dropnike21.github.io\`. Its public **site key** belongs in \`assets/guest-config.js\` once ready.
4. Firebase **Cloud Functions requires Blaze billing**. Set a low budget and monitoring alerts, and audit expected charges before deploying.
5. Create a strong HMAC secret in Firebase Secret Manager via Firebase CLI:
   \`firebase functions:secrets:set INVITATION_CODE_HMAC_KEY\`
   Never put this secret in GitHub or web client configuration.
6. Install Firebase CLI and run the project from a trusted computer. Deploy only when these settings are ready:
   \`\`\`sh
   npm install -g firebase-tools
   firebase login
   cd functions && npm install && cd ..
   firebase deploy --only firestore:rules,functions
   \`\`\`
   Deployment has not been performed by ChatGPT. Validate CLI/project selection first.
7. Create a trusted organizer Google-authenticated Firebase account. Grant the **admin** custom claim using a trusted Firebase Admin SDK environment with sufficient IAM permissions, not browser JavaScript or a client-side flag. See \`functions/scripts/grant-admin.js\` (requires Application Default Credentials and authorized project access).
8. Create \`weddingSettings/camera\` with \`openAt\` and \`closeAt\` as **Firestore Timestamp** values. For February 23, 2027, choose the precise start/end instants in Asia/Manila. Use a **separate test period** for rehearsal.
9. Verify code issuance, one-device and two-device use, RSVP, rotation, old-code rejection, old-session rejection, and revocation in Firebase Emulator or a dedicated staging project.
10. Only after successful testing, change \`assets/guest-config.js\` to \`enabled: true\` with the **public** App Check Enterprise site key, and publish the frontend. Do not enable prematurely.

Note: enabling Google sign-in on GitHub Pages may require additional provider/domain configuration. Ensure the Firebase project authenticates correctly at the final hosted URL before use.

## Future photo storage

- A separate trusted backend will receive and validate each upload. The camera button on the current page is intentionally **local only**.
- The backend must verify the Firebase anonymous session, current invitation revision, and allowed event window **on every upload**, as close as possible to committing the photo.
- Keep Google Drive OAuth tokens, file access and Drive folder IDs server-side; do not publish them in JavaScript.
- Validate actual MIME type, content, size, image count, network and invitation quotas.
- The 48-hour gallery lock must be enforced server-side on download, regardless of what the browser countdown says.
- A school-managed Workspace account can change quotas/permissions; keep a second copy of irreplaceable photos somewhere you control.
- Google Sheets will eventually mirror Firestore planning records one-way and use read-only human access, not act as the primary database.

## Test cases before production

- [ ] Issue code for individual and for family group.
- [ ] Verify manual code and prefilled URL on Android and iPhone.
- [ ] Multiple family phones can use the same code.
- [ ] Invalid codes trigger safe errors; many attempts trigger throttling.
- [ ] RSVP can be changed by the currently valid code.
- [ ] Regenerate returns a different code; original stops working.
- [ ] A guest session redeemed before regeneration fails RSVP and camera-access checks afterward.
- [ ] Revoked invitation cannot redeem or submit RSVP.
- [ ] Private invitation list is inaccessible without an admin custom claim.
- [ ] No plaintext codes, tokens, private guest data or Google Drive credentials appear in public GitHub source.
- [ ] Real-world old guests can understand QR, backup text code and large buttons.
