# Proposed: one invitation with individual seat codes and safe multi-device use

**Status:** design proposal only for distinct per-seat codes. A normal
one-code-per-invitation backend and photo upload path exist in source, but
Firebase deployment and real upload verification remain necessary.
Do not distribute wedding-day codes before testing.

## Recommended guest experience

A parent/family/group invitation can represent multiple allotted seats. Example:

| Invitation | Allotted seats | Printed codes | RSVP grouping |
|---|---:|---|---|
| Santos family | 4 | 4 unique QR codes, numbered 1–4 (optionally personalized) | One household invitation; four seat responses |
| Guest alone | 1 | 1 unique QR code | One seat response |
| Couple | 2 | 2 unique QR codes | Two seat responses |

The **invitation** is the parent group and controls the total number of allotted
seats. Each **seat** has its own code and optionally a name. The invitation
card can contain several small QR codes and their printed backup codes. Guests
select their own code. Parents can manage a child's seat without a separate
login. Codes are not passwords to the organizer workspace.

If the **same seat code is entered on two phones**, both devices receive
sessions pointing to the *same* invitation and seat; this does **not** create a
new seat, extra RSVP, or extra photos. Codes should remain active on multiple
devices by default; don't forcibly log the first device out.

## Server-side proposed data model

```text
invitationRegistry/{groupId}
  partyLabel, invitedSeats, status, groupRevision, photoLimit, photosUsed
  // invitedSeats = fixed quantity granted by organizers

invitationRegistry/{groupId}/seats/{seatId}
  seatNumber, guestLabel?, rsvp, status, seatRevision, codeDigest
  // one unique code per seat, optionally assign guest label

invitationCodes/{HMAC(code)}
  groupId, seatId, groupRevision, seatRevision, status
  // no plaintext code at rest

guestSessions/{anonymousAuthUID}
  groupId, seatId, groupRevision, seatRevision, validUntil
  // one anonymous Firebase UID per browser/device

photoUploads/{uploadId}
  groupId, seatId, sessionUid, frameNumber, ...
```

### RSVP behavior with two simultaneous phones

- Both phones can view the same seat's RSVP and edit it.
- **One seat contributes at most one confirmed attendance** (e.g. Yes = 1,
  No = 0). The party total is the sum of accepted seats and cannot exceed
  `invitedSeats`.
- Use Firestore **server transactions** for seat RSVP changes. Store an
  `rsvpVersion` and require the caller's last-seen version, or return a
  conflict message and prompt refresh if the other phone updated it first.
  Avoid silently overwriting different answers from simultaneous devices.
- The organizer can change the parent's allotted seats, but reducing the
  number requires explicitly revoking associated seat codes; it must not
  silently invalidate already accepted guests without warning.

### Photo behavior with two simultaneous phones

- Recommend **50 photos per invitation group**, shared across its codes and
  all devices, rather than 50 per phone or 50 per seat. The number can later
  be made configurable by organizers.
- Both devices may shoot concurrently, but the backend must reserve or finalize
  one frame using an **atomic Firestore transaction** on the group counter.
  Each completed image receives a unique frame number. If 49/50 are used,
  only **one** of two simultaneous finalizations may claim frame 50.
- Each upload receives a unique idempotency key (uploadId) and may be finalized
  only once; retrying must return the original receipt rather than consume
  another frame.
- The displayed remaining count is advisory and might briefly lag on another
  phone. Recheck the server on return to the camera, after capture/upload, and
  periodically while the camera is open. A denial at 50/50 should show a
  friendly message, not discard the guest's local copy.
- **Current source:** `functions/index.js` already has the shared group
  counter and transactionally finalizes photos; its single-code-per-group
  identity needs to be extended to bind and validate individual `seatId`s.
  The currently enabled preview uses device-local storage only, so testing
  two devices in preview does **not** simulate production synchronization.

### Security and revocation

- Issue each code using a cryptographically secure random generator. Index
  only an HMAC digest server-side; show the raw code **once** during issue.
- Every redeem, RSVP, upload, download and session refresh validates group
  status/revision **and** seat status/revision; never trust a client-provided
  `groupId`, `seatId` or quota.
- **Rotate one seat code:** invalidate sessions for only that seat.
  **Revoke a group:** invalidate every seat code and device session.
- Rate-limit guesses and require Firebase App Check. No shared bearer code
  should grant access to the planner.
- Plan explicit migration for existing one-code family invitations; do not
  automatically turn a family code into several usable codes or activate
  production while backend/schedules remain untested.
- Match invitation administration permissions to the existing authenticated
  organizer roles; the current source's separate admin-custom-claim requirement
  has not yet been reconciled with planner's owner/coordinator roles.

## Acceptance tests before release

1. Create a 4-seat family invitation; exactly four distinct codes appear once.
2. Codes A and B track different seats of the same invitation.
3. Device 1 and Device 2 redeem code A: both refer to **the same** seat.
4. Device 1 confirms seat A; Device 2 refreshes and sees A confirmed; total is one.
5. Two conflicting RSVP submissions use version checking; one succeeds and one
   receives a friendly conflict/refresh response.
6. Device 1 and Device 2 finalize photos simultaneously at 49/50: one succeeds
   as #50 and one gets a quota error; final counter stays 50.
7. Retry the same uploadId: no duplicate photo count.
8. Rotate seat A's code: only A's old sessions fail; seat B remains valid.
9. Revoke group: all seat codes and sessions become invalid.
10. Keep direct Firestore access to guest codes, sessions and private invitation
    records denied from untrusted browsers.

**Decision preserved for the next implementation:** one code per allocated seat,
unlimited devices per code but shared identity, shared group photo quota, and
atomic server-side enforcement.
