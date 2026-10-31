# Invitation-code camera access

## Guest experience

1. Each invitation/family receives one randomly issued 8-character code, for example `7K2M-9R4P`. **This example is not valid.**
2. Invitation links use a URL fragment: `https://dropnike21.github.io/MyWedding/#camera/7K2M-9R4P`.
   - A URL fragment is not sent to the website host with ordinary HTTP requests.
   - The page reads it, fills the input, and promptly removes it from the browser address bar.
   - **Anyone who receives a forwarded link or knows its code can attempt to use it.** An invitation link is a bearer credential, not proof of identity.
3. Older relatives may instead visit the website, choose **Guest Camera**, and manually enter the code.
4. There is no visible login or app installation. Firebase uses a temporary anonymous account behind the scenes; the backend checks the code.
5. During the approved date/time window, an authenticated backend session may submit photos. The photo-upload endpoint is **not implemented yet**.
6. Photos will be private in a dedicated Google Drive folder. The gallery must be locked by backend authorization until the designated release time (for example 48 hours after the wedding).

## Status as of initial implementation

- The guest code page and deep-link parser are committed.
- Code redemption Cloud Functions source is prepared but **not deployed**.
- `assets/guest-config.js` has `enabled: false`. Keep it false until all required security services are active.
- No code is currently issued, valid, or verified by the live site.
- Firebase Web SDK is initialized, but backend guest sessions, Auth anonymous sign-in and App Check **must be configured**.
- There is no live upload service to Google Drive, and the visible camera remains an explicitly **local-only preview**.

## Required Firebase setup before enabling verification

1. Use Firebase project `mywedding-1ad09`, whose Firestore database is already created.
2. Set production Firestore **Rules** to a restrictive policy; a deny-all starting point is included in `firestore.rules`.
   - **The file in GitHub does not change cloud rules until you deploy it or paste it into Firestore > Rules.**
   - Inspect any existing collections/rules first; deploying it will replace the existing rules.
3. Enable **Authentication → Sign-in method → Anonymous** for silent guest sessions.
4. Set up **App Check** for the GitHub Pages web app with an appropriate reCAPTCHA provider, including the actual Pages hostname.
5. Upgrade to Firebase **Blaze** before attempting Cloud Functions deployment. Set budget alerts and appropriate quotas first.
6. Generate a strong random HMAC secret and configure it only in Google Secret Manager via Firebase CLI:
   `firebase functions:secrets:set INVITATION_CODE_HMAC_KEY`
   - Do not enter this secret in GitHub or `assets/firebase-config.js`.
   - Use a long cryptographically random value; never hardcode it.
7. Install the Firebase CLI locally, log in with your Firebase administrator account, install dependencies inside `functions/`, and deploy Firestore rules and Cloud Functions.
8. Grant an organizer's Firebase user the **admin** custom claim using trusted Firebase Admin SDK tooling (not client JavaScript). The `createInvitation` callable function denies non-admin calls.
9. Create `weddingSettings/camera` with `openAt` and `closeAt` as Firestore Timestamp values.
   - Set them in Philippine time when planning, but store actual instants as Timestamps.
   - Change them for a dedicated staging rehearsal; never rely on visitors' phone clocks.
10. After deployment and real-device testing, set `assets/guest-config.js` `enabled: true`, enter the **public** App Check site key, and publish the frontend.
    - This app-check key is public configuration, not a private API secret.

## Firestore server-only schema

All collections below are kept inaccessible to direct unauthenticated browser reads/writes by default:

| Path | Contents | Access |
| --- | --- | --- |
| `invitationCodes/{HMAC_SHA256(code)}` | invitationId, partyLabel, status, createdAt | Server only |
| `invitationRegistry/{randomId}` | code digest, partyLabel, status | Admin server only |
| `invitationAttemptLimits/{digest}` | short-lived rate-limit counters | Server only |
| `guestSessions/{anonymousUid}` | invitationId, validUntil | Server only |
| `weddingSettings/camera` | openAt, closeAt; later releaseAt | Server/admin only |

Do not store the raw codes in Firestore. Organizer invitation issuance returns the plain code once; keep the generated invitation link securely.

## Upload security — required next implementation

The eventual upload endpoint **must** check each request independently, not trust the web page's `cameraOpen` message.

- Verify anonymous Firebase ID token and App Check token.
- Check the server-created guest session against the authenticated Firebase UID.
- Verify the invitation is still active, and the server time falls between `openAt` and `closeAt`.
- Limit photo size, file count, content type, upload frequency, and simultaneous uploads.
- Use the Google Drive account owner's OAuth credentials only on the server, stored in Secret Manager.
- Store images in a private dedicated Drive folder; record metadata in Firestore.
- Never expose a Google Drive refresh token or unrestricted public folder link to visitors.
- Apply a separate server-side authorization check for photo gallery downloads and the 48-hour release.
- Keep a separate photo backup outside the school-managed Google Workspace account.

## Important restrictions

- The same family code can be used from multiple devices. Do not enforce one-device-only tokens unless explicitly requested.
- Code verification cannot guarantee the user is the named guest; codes and QR links can be forwarded.
- App Check helps reduce abuse but **is not** a substitute for session, quota and event-window checks.
- The existing local camera demonstration can be used without a code because it cannot upload or access private records.
- Use a family/helper station and a simple printed short URL plus code for elderly guests.
