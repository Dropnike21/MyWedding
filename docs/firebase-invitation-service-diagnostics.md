# Troubleshooting `internal [0]` in wedding guest invitations

## What the error means

Planning Studio can display saved Firestore wedding guests even when the
separate Firebase **Cloud Functions** service is missing or misconfigured.
The guest invitation manager calls these callable Functions:

| Page operation | Function | Needs other services |
|---|---|---|
| List existing invitation codes (not plaintext) | `listInvitations` | Firebase Auth + App Check + deployed Function |
| Generate private invitation link | `createInvitation` | Above + HMAC secret `INVITATION_CODE_HMAC_KEY` |
| Open/close one invitation camera | `setInvitationCameraAccess` | Firebase Auth + App Check |
| List finalized photo metadata | `listPhotoUploads` | Firebase Auth + App Check + Firestore |
| Check private RAW/WATERMARKED folders and audit sheet | `driveStorageStatus` | Above + Google Drive OAuth secret + folder/Sheet access |

If **listing** and **creation** both fail, check Cloud Functions availability
and callable authorization before investigating Drive credentials. The
generic `functions/internal` status alone is **not proof** of missing Functions:
an unhandled runtime exception also returns that status.

**Do not delete or recreate the saved guest; do not change Firestore rules to
public access.** Guest code issuance and Drive access must remain server-side.

## Check in the Firebase Console first (works from phone)

1. Open [Firebase Console — Functions](https://console.firebase.google.com/project/mywedding-1ad09/functions).
2. Confirm the exact **project** `mywedding-1ad09` and **region**
   `asia-southeast1`.
3. Look for `listInvitations`, `createInvitation`, `listPhotoUploads`,
   `driveStorageStatus`, `setInvitationCameraAccess`,
   `getInvitationDetails`, `beginGuestPhotoUpload`,
   `finalizeGuestPhotoUpload`, `cancelGuestPhotoUpload` and
   `deleteInvitationAndPhotos`.
4. **If the functions are absent**, they need deployment from this
   repository. GitHub Pages does **not** deploy Firebase Functions.
5. **If they exist**, open the logs for `listInvitations` and
   `createInvitation`. Repeat one request in Planning Studio and inspect
   the corresponding invocation. Look for authentication, App Check,
   runtime exceptions and Firestore permissions.
6. Check Firebase Authentication for Google organizer sign-in. The verified
   wedding owner must be signed in; anonymous guests cannot issue codes.
   Check App Check tokens for `dropnike21.github.io`.
7. Do not enable public write access or expose service-account/OAuth secrets
   in order to make the error disappear.

## CLI diagnosis and deployment (trusted computer / private terminal)

Install Node.js 22 and a current Firebase CLI, and run these commands from
the root of a checked-out copy of this GitHub repository:

```sh
npm install --prefix functions
firebase login
firebase functions:list --project mywedding-1ad09
firebase functions:log --only listInvitations --project mywedding-1ad09
firebase functions:log --only createInvitation --project mywedding-1ad09
```

If the functions are absent, ensure Blaze billing and project API
permissions are enabled, and check secret *metadata* (not values):

```sh
firebase functions:secrets:get INVITATION_CODE_HMAC_KEY --project mywedding-1ad09
firebase functions:secrets:get GOOGLE_DRIVE_OAUTH --project mywedding-1ad09
```

Set a missing HMAC secret using `firebase functions:secrets:set
INVITATION_CODE_HMAC_KEY --project mywedding-1ad09`; provide a
cryptographically random high-entropy key at the private prompt. Do not
casually replace an existing HMAC key, because old invitation codes depend
on it.

For `GOOGLE_DRIVE_OAUTH`, a privately provided JSON object must have
`clientId`, `clientSecret` and `refreshToken` with verified access to
the wedding's dedicated Google Drive RAW and WATERMARKED folders and private
photo audit spreadsheet. **Never put this secret in chat or GitHub.**

Once prerequisites are satisfied, deploy:

```sh
firebase deploy --only functions --project mywedding-1ad09
firebase functions:list --project mywedding-1ad09
```

Inspect the deploy output. Firebase may offer to remove obsolete previously
deployed rehearsal Functions; review names before accepting. Do **not**
blindly deploy or delete existing unrelated Functions.

If Drive credentials are not ready, the invitation-only functions can be
deployed first (listing and code generation still require successful Auth,
App Check and HMAC secret setup). A complete camera upload additionally
requires Drive OAuth and the remaining photo Functions.

## How to verify a successful fix

1. Refresh Planning Studio after GitHub Pages publishes the latest web
   changes; new errors will distinguish **invitation list**, **photo
   records**, and **Drive connection** failures.
2. Open **Photo archive**. The invitation list should load; the photo
   metadata list should load even if Drive status separately fails.
3. With your saved guest selected, generate a private invitation link once.
   Do not regenerate unnecessarily: doing so invalidates the old link.
4. Open the link on another phone; verify guest name, code redemption,
   camera access and a real upload.
5. Check Firestore photo metadata, both private Drive folders and the
   protected Sheet. Finally, use owner-only **Delete guest & photos** only
   after successful upload confirmation.

**Status:** The GitHub code is not a substitute for an observed Firebase
deployment. Passing static source tests does not establish that Cloud
Functions, App Check, OAuth or Drive permissions are live.
