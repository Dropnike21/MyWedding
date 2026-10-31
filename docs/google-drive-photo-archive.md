# Google Drive Guest Photo Archive

## Current Drive layout

Parent folder:
- guest photos folder
- ID: `1ynfDsAZjs4Nf-_NQOYR8k8T_UbVtkvYj`

Subfolders:
- RAW — `1zug2sW_wvAooJH84gjHu2zqxUUVk2XtN`
- WATERMARKED — `1ExaPGWwiyOSxp8KI0XMgH78opWH6vmH5`

Audit Google Sheet:
- Guest Camera Photo Index — WEBSITE MANAGED
- Spreadsheet ID: `1UJaF7Cquad43ppfuO1zMJcRBZOtnmZQItbFQoxFng5c`
- Tabs: Dashboard, Photo Log, Configuration
- The tabs are protected with edit warnings during the wedding.
- Website/Firebase is the source of truth. The Sheet is an audit mirror.

## Upload architecture

1. Guest captures a photo in the wedding camera.
2. Browser creates:
   - a clean high-quality RAW JPEG
   - a filtered + A&J-watermarked JPEG
3. `beginGuestPhotoUpload` validates:
   - Firebase anonymous guest session
   - current invitation revision
   - event camera window
   - remaining 50-photo allowance
   - expected file sizes
4. The function uses the wedding owner's Google OAuth refresh token to create two
   Google Drive resumable upload sessions.
5. The browser uploads JPEG bytes directly to Google Drive using the returned
   short-lived session URLs. The OAuth access token is never returned to the browser.
6. `finalizeGuestPhotoUpload` verifies both Drive files and their server-assigned
   metadata, then atomically increments `photosUsed` in Firestore.
7. The function records the finalized upload in `photoUploads/{uploadId}`.
8. The function appends one row to the protected Photo Log tab.
9. Wedding Studio's owner-only Photo Archive view reads Firestore metadata rather
   than relying on manual Sheet edits.

## Google Cloud setup required before enabling uploads

Use the same Google Cloud/Firebase project: `mywedding-1ad09`.

Enable:
- Google Drive API
- Google Sheets API

Create an OAuth 2.0 client for a server/web application.

For a one-time refresh-token bootstrap with Google OAuth Playground, add this
authorized redirect URI to that OAuth client:

`https://developers.google.com/oauthplayground`

Authorize with the Google account that owns the wedding Drive files:
`josephsixson@mcstayuman.edu.ph`

Required scopes:
- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/spreadsheets`

Request offline access and obtain a refresh token.

## Store OAuth credentials securely

Never commit the client secret or refresh token.

Create a local JSON file that is NOT committed:

```json
{
  "clientId": "YOUR_GOOGLE_OAUTH_CLIENT_ID",
  "clientSecret": "YOUR_GOOGLE_OAUTH_CLIENT_SECRET",
  "refreshToken": "YOUR_GOOGLE_OAUTH_REFRESH_TOKEN"
}
```

Then store it in Firebase Secret Manager:

```bash
firebase functions:secrets:set GOOGLE_DRIVE_OAUTH --data-file drive-oauth.json
```

The invitation HMAC secret is still separate:

```bash
firebase functions:secrets:set INVITATION_CODE_HMAC_KEY
```

Deploy:

```bash
firebase deploy --only functions,firestore:rules
```

## Frontend activation

Keep these disabled until the deployed functions pass testing:

```js
enabled: false,
driveUploadsEnabled: false,
```

After invitation redemption, App Check, the Drive OAuth connection, and a full
test upload succeed, switch both to `true` in `assets/guest-config.js`.

## Functions

Guest:
- `beginGuestPhotoUpload`
- `finalizeGuestPhotoUpload`
- `cancelGuestPhotoUpload`

Owner:
- `driveStorageStatus`
- `listPhotoUploads`

## Failure behavior

- A Drive upload does not consume a frame until finalization succeeds.
- The server re-checks the invitation revision and 50-frame limit during finalization.
- If quota is reached after the browser has already uploaded the files, the server
  deletes those just-uploaded files before returning the quota error.
- If the Google Sheet append fails, the photo remains safely stored in Drive and
  finalized in Firebase; `sheetLogged=false` is recorded so it can be reconciled.
- The Google Sheet is never used to authorize guests or enforce quotas.

## After the wedding

The protected-range warnings on Dashboard, Photo Log, and Configuration can be
removed. At that point the Sheet can become a normal editable archive/export while
the RAW and WATERMARKED folders remain the original photo source.
