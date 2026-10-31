# Connect Wedding Studio to Firebase

The Wedding Studio source is already wired for Firebase. The guest camera remains disabled.

## Current architecture

- **GitHub Pages**: static frontend
- **Firebase Authentication**: Google sign-in for owners/coordinators
- **Firebase App Check**: Fraud Defense / reCAPTCHA Enterprise
- **Cloud Firestore**: primary wedding-planning database
- **Firestore Security Rules**: role-based planner access; invitation/camera collections stay server-only
- **Cloud Functions**: reserved for invitation-code security and Google Drive uploads later

The planner uses direct Firestore access because Authentication + App Check + Security Rules are sufficient for private CRUD. This avoids Cloud Functions charges for normal planning operations.

## 1. App Check configuration

Your Fraud Defense / reCAPTCHA Enterprise key must allow the hostname:

`dropnike21.github.io`

Do not use `https://` and do not include `/MyWedding`.

In Firebase > App Check, the web app should be registered with that Enterprise/Fraud Defense site key.

Copy the **public site key** and put it in:

`assets/guest-config.js`

```js
export const guestAccessConfig = Object.freeze({
  enabled: false,          // guest camera/invitation backend remains OFF
  plannerEnabled: true,    // Firebase planner is ON
  region: "asia-southeast1",
  callableName: "redeemInvitation",
  appCheckSiteKey: "PASTE_PUBLIC_ENTERPRISE_SITE_KEY_HERE",
});
```

The site key is public configuration. Do not put any reCAPTCHA secret, OAuth client secret, service-account JSON, or Google Drive token in GitHub.

## 2. Publish the planner Firestore rules

The repository's `firestore.rules` now allows only authenticated organizer roles to access `weddings/main`.

Before publishing, review the file. It does the following:

- self-read only for `organizers/{uid}`
- owner: full planner writes
- coordinator: guests, vendors, tasks, timeline, decisions, team
- finance: vendors, budget categories and payments
- all organizer roles: planner reads
- no document deletes through the browser (archive instead)
- invitation codes, guest sessions and camera settings remain deny-all to browsers

Publish via Firebase Console > Firestore > Rules, or with Firebase CLI after confirming the correct project.

## 3. Default groom / owner accounts

These two verified Google accounts are built into the planner as default `owner` identities:

- `babaynike2013@gmail.com`
- `josephsixson@mcstayuman.edu.ph`

They do **not** require an `organizers/{uid}` Firestore document. Firestore Security Rules independently verify the signed-in Firebase token's verified email before granting owner permissions.

Because this repository is public, these two addresses are visible in the published rules/source. If that is undesirable, remove the built-in allowlist and use UID-based `organizers/{uid}` records instead.

For any additional owner, coordinator, or finance account, the planner authorizes against:

`organizers/{FIREBASE_AUTH_UID}`

If your Google account already appears in Firebase Authentication > Users, copy its **UID**.

If it does not appear yet:

1. Complete steps 1 and 2 above.
2. Open the GitHub Pages Wedding Studio.
3. Sign in with Google.
4. The planner will say the account is not registered.
5. Return to Firebase Authentication > Users and copy the UID that was just created.

Then in Firestore Console create collection:

`organizers`

Create a document whose **document ID is exactly the Firebase Authentication UID**.

Fields:

| Field | Type | Example |
| --- | --- | --- |
| `active` | boolean | `true` |
| `role` | string | `owner` |
| `displayName` | string | `Joseph` |
| `email` | string | your organizer Google email |

Do not use Auto-ID for this document. The UID must be the document ID.

Sign out and sign in again on Wedding Studio.

If `weddings/main` does not exist yet, the first **owner** automatically seeds the Firebase planner with the current starter data and budget categories.

## 4. Add a coordinator later

The coordinator must first sign in with Google once so Firebase Authentication creates their UID.

Create:

`organizers/{COORDINATOR_UID}`

Fields:

```
active: true
role: "coordinator"
displayName: "Coordinator name"
email: "coordinator@example.com"
```

Coordinator permissions:

- view planner dashboard
- manage guests
- manage suppliers
- manage checklist
- manage timeline
- manage decisions
- manage team/coordinator records
- view financial summaries
- cannot edit event setup
- cannot edit budget allocations or payments

For a finance-only helper use `role: "finance"`.

## 5. Test before enabling App Check enforcement

Firebase recommends monitoring valid App Check traffic before turning enforcement on.

Suggested sequence:

1. Put the Enterprise site key in `assets/guest-config.js`.
2. Let GitHub Pages publish the change.
3. Open Wedding Studio.
4. Sign in as owner.
5. Confirm the planner loads Firestore and shows **FIREBASE SYNCED**.
6. Add a fictional guest.
7. Confirm a new document appears under `weddings/main/guests`.
8. Add a supplier and payment.
9. Confirm those subcollections update.
10. Edit a task and verify changes survive browser refresh.
11. Test from a second browser profile with an unregistered Google account: access must fail.
12. Add a test coordinator UID and verify coordinator restrictions.
13. Review App Check metrics.
14. Only then enable App Check enforcement for Firestore (and later Authentication if desired).

If enforcement is enabled before the correct site key is deployed, legitimate GitHub Pages requests may be blocked.

## Firestore layout

```
organizers/
  {uid}

weddings/
  main
    guests/
    vendors/
    payments/
    budgetCategories/
    tasks/
    timeline/
    decisions/
    team/
    audit/
```

The root `weddings/main` document contains event settings such as date, venue, ceremony type, budget and target guest count.

## Backup behavior

While Firebase mode is active:

- Firestore is primary.
- The browser keeps a local cache as an emergency convenience only.
- **Export backup** remains available.
- **Import backup** and **Reset demo** are disabled to avoid accidentally replacing live data.
- Google Sheets synchronization is not yet active.

## Troubleshooting

### "This Google account is not registered as a wedding organizer"

Create `organizers/{uid}` using the exact Firebase Authentication UID.

### "Missing or insufficient permissions"

Check:
- the signed-in UID
- organizer document `active: true`
- `role` spelling
- published Firestore rules
- App Check configuration/enforcement

### App Check / 403 errors

Verify:
- Fraud Defense domain is `dropnike21.github.io`
- the exact Enterprise site key is in `assets/guest-config.js`
- GitHub Pages has deployed the updated file
- App Check metrics show valid traffic
- browser extensions/privacy software are not blocking reCAPTCHA Enterprise

### Google sign-in fails

Verify Google provider is enabled in Firebase Authentication and `dropnike21.github.io` is an authorized domain.

## Do not enable guest-camera access yet

Keep:

`enabled: false`

in `assets/guest-config.js`.

Guest invitation code validation and Drive photo uploads require the secure Cloud Functions deployment and separate testing.


## Wedding Expenses collection

`weddings/main/expenses/{expenseId}` stores non-supplier spending such as attire, rings, souvenirs/favors, gifts, legal/document costs, transport, accessories, and other direct purchases.

Owners, coordinators, and finance organizers can manage expense records. Budget-category allocation remains owner/finance controlled.
