# Wedding Studio — local demo testing

The **Wedding Studio** is intentionally running in local-demo mode while Firestore remains locked with deny-all browser rules.

## What is safe to test now

All data below is stored only in your browser's `localStorage` under a MyWedding demo key. It is **not** written to Firestore, Google Drive, Google Sheets, or GitHub.

- Event setup: wedding date, budget, venue, ceremony details, guest target
- Guests and family groups: estimated seats, RSVP, confirmed attendance, relationships, priority and table
- Suppliers: categories, quotations, agreed costs, booking status and decision dates
- Budget allocations: editable category caps
- Payments: supplier, description, amount, due/paid dates, method and status
- Checklist: workstream, owner, deadline, priority and progress
- Wedding-day timeline: time, activity, location, lead and confirmation status
- Decision log: open choices, owners, due dates and final decisions
- Coordinator team: roles, contacts and availability
- Overview calculations: days remaining, guest estimates, confirmed seats, supplier commitments, amount paid, open/overdue tasks
- Archive/restore for master records
- JSON backup export/import

## Recommended test scenario

1. Open **Planning Studio → Event setup**.
2. Keep the tentative date as February 23, 2027 and total budget at ₱70,000.
3. Add 5–10 fictional guest/family records.
   - Try one family with 4 estimated seats.
   - Set 3 seats confirmed.
   - Mark another invite as No and another as Maybe.
4. Add 3 fictional suppliers:
   - Venue/catering
   - Photographer
   - Hair/makeup
5. Enter quoted and agreed values.
6. Open **Budget & payments**.
   - Adjust category allocations.
   - Record a deposit as Paid.
   - Record a future balance as Planned or Due.
7. Add checklist items with different owners and deadlines.
   - Set one deadline in the past to confirm the overdue count.
   - Mark one task Done.
8. Add or change wedding-day timeline entries.
9. Add an open decision, then mark it Decided.
10. Add a coordinator/helper and record their contact/role.
11. Return to **Overview** and check that all summaries changed.
12. Archive one guest or supplier and verify active totals exclude it.
13. Use **Show archived** and restore it.
14. Select **Export backup**.
15. Reset the demo.
16. Import the exported JSON file and confirm the data returns.

## Browser/storage limitations

Local demo data is specific to the browser profile and device. Private/incognito mode, browser cleanup, storage policies, or clearing site data can remove it.

Use **Export backup** if you are entering test data you want to preserve.

Do not use the local-demo workspace as the authoritative wedding database. It is a UX/prototyping environment only.

## Firestore migration plan

Once Firebase Authentication, App Check and callable Cloud Functions are ready:

1. Keep the same frontend forms and navigation.
2. Replace local `load/save` operations with protected callable functions.
3. Use Firestore as the authoritative planning database.
4. Add optimistic updates and server validation.
5. Create audit-log records for organizer/coordinator changes.
6. Add role permissions:
   - Couple / owner: all planning records
   - Coordinator: operational tasks, timeline, guests where permitted
   - Finance role: budget, supplier and payment records where permitted
   - Guests: only their own invitation/RSVP and event-day camera functions
7. Mirror approved Firestore planning records one-way to a locked Google Sheet for review.
8. Keep Google Sheet manual editing disabled for ordinary users.
9. Test backups and restoration separately from the Google Sheets mirror.

## Current security state

- The repository includes restrictive `firestore.rules` source, but GitHub code does not automatically change your live Firebase rules.
- The user's provided rule `allow read, write: if false` is the safest baseline while browser database access is not needed.
- Local-demo planner testing does not require weakening those rules.
- Invitation and camera Cloud Functions remain disabled on the live frontend.
