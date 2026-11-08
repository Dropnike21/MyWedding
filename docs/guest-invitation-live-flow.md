# Normal guest invitation, camera and photo deletion workflow

The website uses **real guest records**, not temporary rehearsal invitations.
There is **no one-hour timer, no separate test code and no test-photo mode**.
Owners may use their own guest record to exercise the entire flow before the
wedding, then remove that guest and its photos intentionally.

## Owner workflow

1. Sign in as a verified owner at **Planning Studio → Guests & RSVPs**.
   Add yourself as a normal guest (or choose a saved guest). Use a unique name.
2. Select **Invitations & photo cleanup** in the Guests screen, or open
   **Photo archive** directly.
3. Select your saved guest in **Invitation links & camera access**, and choose
   **Generate invitation link**. This issues a genuine random eight-character
   code (stored only as a server-side HMAC digest).
4. **Copy the link immediately**. The code itself is not saved in the planner.
   If lost, use **Regenerate link**, which invalidates the previous code.
5. Camera access is opened for that **specific invitation**, without a
   deadline. You can **Close camera** at any time. This does not enable every
   other guest's camera or change the wedding-day schedule.
6. Open the copied link on a separate device. The landing page should display
   Angela & Joseph, the current public wedding date/venue, and the recipient
   name/seat count after secure verification. Tap **Open your wedding camera**.
7. Take a photo. The client should send both RAW and edited JPEGs through
   server-verified Google Drive uploads. The backend assigns a frame
   transactionally and logs the upload in Firestore and the protected Sheet.
   Check the **Photo archive** and the two private Drive folders.
8. Once every upload finishes, find that invitation in the list and choose
   **Delete guest & photos**. Type `DELETE` to confirm. This revokes the
   invitation, deletes both Drive copies and matching audit rows, removes
   corresponding Firestore photo/session/invitation records, and submits
   removal of the linked saved guest to the planner.
9. Refresh the archive and the guest list. Confirm the guest, link, photos
   and audit rows no longer appear. If deletion reports an error, retry the
   same pending deletion: the code remains revoked until cleanup succeeds.

**Warning:** Deletion is permanent. It is not equivalent to archiving a
guest from Guests & RSVPs, which preserves their planner record and does
not delete photos. The server only reports deletion success after Drive and
Sheet operations complete. Previously exported backups, manually copied
photos, browser downloads, or external shared links are outside that cleanup.

## Two devices with the same invitation link

The code identifies one shared invitation. Multiple phones can redeem it,
but neither the seat allotment nor photo quota is multiplied. Both devices
keep independent camera settings. The camera polls the server around every
15 seconds while active to update the shared film count. In a simultaneous
final upload race, an atomic Firestore transaction awards the next frame to
one uploader. A second upload may fail when the quota is exhausted. No
full-resolution images are downloaded to other cameras.

## Required deployment to run the real test

The GitHub Pages source alone cannot confirm a real upload. Before trying
the new invitation, confirm:

- Firebase **Blaze** Cloud Functions support and Firestore in project
  `mywedding-1ad09`.
- **Google** sign-in for owners and **Anonymous** sign-in for invited guests.
- Firebase **App Check** configured for `dropnike21.github.io`; the source
  uses Firebase callable Functions with App Check enforcement.
- Private Google Drive RAW and WATERMARKED folders and the protected
  Photo Log spreadsheet accessible to the configured OAuth account.
- Secret Manager includes `INVITATION_CODE_HMAC_KEY` (high-entropy
  HMAC secret) and `GOOGLE_DRIVE_OAUTH` (JSON keys
  `clientId`, `clientSecret`, `refreshToken`).
- Deploy Functions from a trusted computer after reviewing the GitHub code:

```sh
npm install --prefix functions
firebase login
firebase functions:secrets:set INVITATION_CODE_HMAC_KEY --project mywedding-1ad09
firebase functions:secrets:set GOOGLE_DRIVE_OAUTH --project mywedding-1ad09
firebase deploy --only functions --project mywedding-1ad09
```

Do not paste private secrets into GitHub, ChatGPT, or public JavaScript. When
deploying updated Functions over the former rehearsal version, Firebase CLI
may prompt about deleting obsolete exported test Functions. Review that
prompt carefully.

**Deployment has not been verified in this repository change.** Before
telling actual guests that camera uploads work, test one real invitation,
code verification, two photos, the Drive folders, the audit Sheet, multiple
devices and the complete deletion workflow on a phone.

## Limits and operational precautions

- The current invitation registry issues **one code per guest/family**
  invitation. Individual code-per-seat is still a separate future change.
- Do not delete an invitation while its phone shows **Uploading**; let
  uploads finish. Deletion revokes access before cleaning up. If an
  in-flight operation fails, retry the cleanup after it settles.
- The current planner is not live-subscribed across organizer browser tabs.
  Refresh the other owner's planner after a confirmed change.
- Deletion is deliberately not a universal browser-side Drive delete:
  only the authenticated owner can request the protected cleanup Function.
- If Google Drive or Sheets is unavailable, deletion returns a failure and
  keeps the invitation in **DELETION PENDING**, rather than claiming success.
