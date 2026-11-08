# Public wedding details: December 23, 2027

## Purpose and safety boundary

The authenticated Wedding Studio stores the working wedding details in the **private**
`weddings/main.settings` record. The public site cannot and must not read that
entire record, because it also contains planning information.

The couple confirmed **December 23, 2027 (tentative)**. The old February banner
has been removed. The Home date, weekday, countdown, decorative date seal, and
venue summary now use the same public date/venue projection:

`publicWeddingDetails/current`

Only these fields are published:

| Field | Type | Description |
|---|---|---|
| `date` | ISO string | Wedding date, e.g. `2027-12-23` |
| `dateTentative` | boolean | Currently `true` |
| `venueName` | string | Planner's venue name; may be empty |
| `venueTentative` | boolean | Currently `true` |
| `updatedAt` | timestamp | Server timestamp |

**No budgets, guest names, RSVP records, contact numbers, expenses, private
notes, or organizer email addresses are included.** Firestore rules grant only
`get` access to that specific record, while writes require an authenticated
owner and strict field validation. All other wedding records retain their
existing private permissions.

## Publish once after merging this change

1. Open the latest `firestore.rules` in GitHub. In Firebase Console for
   project `mywedding-1ad09`, select **Firestore Database > Rules**.
2. **Replace the entire editor** with the updated file. Keep a backup of any
   console-only changes before publishing. Do not append a second rule block.
3. Click **Publish**. A GitHub merge alone does **not** deploy database rules.
4. Once GitHub Pages has deployed the new frontend, sign in to **Planning Studio**
   with a verified wedding owner account. The planner reads the saved private
   settings and creates/updates the public projection if needed.
5. Check **Firestore Database > Data > publicWeddingDetails > current**.
   Confirm the date is `2027-12-23` and venue name matches Event setup.
6. In another device/browser, open Home and verify the correct date, weekday,
   countdown and venue. Test by changing Event setup date, saving, then observing
   the public site update. Revert test data only after saving.

### Important rollout behavior

Before the updated rules are published, the website safely displays the
**December 23, 2027 tentative fallback**. Firebase cannot supply other future
changes until the public projection can be written/read. After publishing rules,
the owner must open the planner so the record is seeded or synchronized.

The private planner's save is performed first. The public projection is a
separate best-effort write so temporarily missing rules do not break private
planning edits. If a public update fails, the planner reports **PLANNER SYNCED**
and notes that public date/venue publication is pending. Retry by reopening
Planning Studio as an owner after fixing rules.

### Venue protection

`assets/venue-config.js` currently contains a tentative Estoria address, image
and route. If the venue selected in Firebase no longer matches Estoria,
the public page shows the new venue name but **hides the old Estoria map and
directions**, to avoid giving guests a wrong address. Publish confirmed address,
map and photo as a separate explicit step when the venue is decided.

## Existing dates left untouched

This code does **not** overwrite `weddings/main.settings.date` or any existing
guest, budget or supplier record. New local seed/demo records use December
23 only as a fallback for an uninitialized workspace. Any wedding-day camera
open/close schedule in `weddingSettings/camera` remains independently configured
and must be reviewed before enabling guest uploads.
