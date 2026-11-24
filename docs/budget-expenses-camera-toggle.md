# Budget & Expenses and Guest Camera master switch

## Deployment
Review and merge this branch, then from the repository root deploy the rules and functions to the intended Firebase project:
 
    firebase deploy --only firestore:rules,functions --project mywedding-1ad09

GitHub Pages publishes the frontend from main; it does not deploy Firebase. Do not enable the camera until the updated functions and rules have deployed successfully. The master switch defaults to false when the new fields are absent. Old deployed functions do not enforce this switch.

## Finance
- Planning Studio > Budget & Expenses is the single financial entry point. Category allocations are the budget; individual item estimates are not added again.
- New expense records include event, category, quote, confirmed amount, booking/delivery stage, supplier details, and links.
- Confirmed, ordered and completed costs count as commitments; planned and quoted costs do not. Paid transactions and refunds are separate from booking status.
- Use the event filter to separate civil, garden and shared expenses. Legacy records without event labels remain Unassigned. Review and classify them; no ceremony assignment is guessed.
- Legacy supplier records are displayed immediately in the ledger. An owner or finance organizer can choose Migrate existing records. This copies suppliers with deterministic IDs and links existing supplier payments. Aggregate paid fields become undated opening transactions; original records/amounts remain available. Export a backup first.
- Migration is idempotent but does not guess whether two different legacy records represent the same booking. Review possible duplicates and unlinked transactions. No live records are changed by deploying this code alone.
- Coordinator access can edit expenses but cannot edit payments, allocations or migrate. Only owners edit event settings or garden savings.

## Camera
- Event Setup > Website Features > Enable Guest Camera > Save camera setting.
- The owner-controlled private setting is projected into the public-safe document. The backend requires both settings to be true before camera access is granted.
- Disabling the feature hides navigation, homepage and invitation camera actions, stops the active browser camera, denies new upload authorizations and prevents new photo finalizations. Existing invitations, RSVP and photo archive remain available.
- Existing guest links use #camera/CODE; that invitation landing is intentionally retained even when camera access is off. A direct camera route shows an unavailable message rather than a functional camera.
- The existing per-invitation authorization or event schedule still applies when enabled. Google Drive resumable URLs already issued before disabling may remain valid until expiry; they cannot finalize a new photo record while the switch is off.

## Verification after deployment
1. Export a planner backup; compare category allocation, committed, paid and outstanding totals before/after migration.
2. Example: allocations PHP 129,000; ring PHP 28,000 paid; venue PHP 70,000 confirmed, PHP 10,000 paid. Expected commitments PHP 98,000; net paid PHP 38,000; balance PHP 60,000.
3. Add a planned expense and quote: neither increases commitments. Confirm it, record two payments, then a refund. Verify payment history and event filters.
4. Check owner, finance and coordinator access; verify that refresh preserves records.
5. Camera off: verify no public navigation/button, direct camera route unavailable, guest invitation and RSVP still work, existing photo archive available, and begin/finalize upload functions reject new photos.
6. Camera on: grant one test invitation access, verify it works, then turn master switch off and verify the active guest camera closes. Remove the test invitation and photos using the existing owner cleanup flow.
