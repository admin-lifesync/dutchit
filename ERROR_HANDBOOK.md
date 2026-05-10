# Dutch It — Error Handbook

> Every error users can see in Dutch It. Use this as the operations runbook.
> If something breaks in production, the user will see a friendly title plus a
> short error code (e.g. `ERR-GRP-403`). Look that code up here for the
> investigation steps and recovery options.

## How errors flow

```
                     ┌──────────────────────────────┐
                     │ raw / FirebaseError thrown   │
                     └──────────────┬───────────────┘
                                    ▼
                     ┌──────────────────────────────┐
                     │ toAppError()                 │
                     │  lib/errors/firebase-error-  │
                     │  map.ts maps it to a typed   │
                     │  AppError with an ERR-* code │
                     └──────────────┬───────────────┘
                                    ▼
                     ┌──────────────────────────────┐
                     │ handleError()                │
                     │  lib/errors/handle-error.ts  │
                     │  • structured log            │
                     │  • friendly toast            │
                     │  • returns AppError          │
                     └──────────────────────────────┘
```

Source code:

- `lib/errors/error-codes.ts` — canonical list of codes
- `lib/errors/user-messages.ts` — friendly title + description per code
- `lib/errors/app-error.ts` — `AppError` class
- `lib/errors/firebase-error-map.ts` — Firebase ↔ AppError translation
- `lib/errors/handle-error.ts` — entry point used at every catch site
- `lib/logger.ts` — structured dev / prod logger (the only place that touches `console.*`)

## Conventions

- **Code format**: `ERR-<DOMAIN>-<HTTP-LIKE STATUS>`.
- **Domains**: `AUTH`, `GRP`, `EXP`, `STL`, `INV`, `USR`, `NET`, `CFG`, `APP`.
- **User-facing messages** never mention "Firebase", "Firestore", "permission-denied", or any other internal jargon. Enforced by a unit test in `tests/errors.test.ts`.
- **Every catch block** in app code routes through `handleError(e, { domain, context })`. Never throw raw `Error` to the UI.

---

## Authentication errors

### `ERR-AUTH-401` — please sign in to continue

- **User sees**: "Please sign in to continue. Your session has expired. Sign in again to pick up where you left off."
- **Technical cause**: Firestore returns `unauthenticated`, or a protected route was hit without an auth user.
- **Firebase cause**: ID token expired, or never existed.
- **Possible triggers**: Auth session timed out, browser cleared storage, cross-device sign-out.
- **Affected screens**: Any protected page — most often `/dashboard`, `/trips`, `/trips/[id]`.
- **Affected actions**: Any data read/write.
- **Debugging steps**:
  1. Open DevTools → Application → IndexedDB → `firebaseLocalStorageDb`. Confirm a `firebaseLocalStorage` entry exists.
  2. Run `firebase.auth().currentUser` in the console (via the Firebase Web SDK debug build). It should be non-null.
  3. Check the Network tab for `securetoken.googleapis.com` calls — if they 4xx, the refresh token was rejected.
- **Firebase console checks**:
  - Authentication → Users — confirm the user account still exists and isn't disabled.
  - Authentication → Settings → User actions — make sure "Email enumeration protection" isn't blocking.
- **Recovery**: Sign out and sign back in. If it persists across browsers, the project's auth keys may have been rotated.

### `ERR-AUTH-403` — site isn't approved for sign-in yet

- **User sees**: "This site isn't approved for sign-in yet. An admin needs to add this domain to the project's authorized list."
- **Firebase code**: `auth/unauthorized-domain`, `auth/operation-not-allowed`, `auth/user-disabled`.
- **Triggers**: Deploying to a new domain (e.g. preview deployment) without adding it to Firebase.
- **Affected screen**: `/signin`.
- **Recovery**:
  1. Firebase Console → Authentication → Settings → **Authorized domains** → **Add domain**.
  2. Add the exact host (e.g. `dutchit-staging.vercel.app`).

### `ERR-AUTH-409` — sign-in popup was blocked

- **User sees**: "Sign-in popup was blocked. Allow popups for this site, then try signing in again."
- **Firebase code**: `auth/popup-blocked`.
- **Triggers**: Browser popup blocker, embedded webview.
- **Recovery**: User allows popups for the origin and retries.

### `ERR-AUTH-499` — sign-in cancelled

- **User sees**: "Sign-in cancelled. The Google sign-in window was closed before finishing."
- **Firebase code**: `auth/popup-closed-by-user`, `auth/cancelled-popup-request`, `auth/user-cancelled`.
- **Triggers**: User dismissed the popup.
- **Recovery**: No action — silent in the UI; we just drop the request.

### `ERR-AUTH-429` — too many sign-in attempts

- **Firebase code**: `auth/too-many-requests`.
- **Recovery**: Wait ~1 minute before retrying. Check Firebase Authentication → Usage for spikes.

### `ERR-AUTH-503` — couldn't reach sign-in service

- **Firebase code**: `auth/network-request-failed`.
- **Recovery**: Confirm internet, check Firebase status (<https://status.firebase.google.com>).

### `ERR-AUTH-500` — generic sign-in failure

- **Firebase code**: `auth/internal-error` or anything unmapped.
- **Recovery**: Retry; if persistent, capture the structured log entry tagged `auth` and inspect the embedded `cause.firebaseCode`.

---

## Group / trip errors

### `ERR-GRP-404` — trip not found

- **User sees**: "Trip not found. This trip may have been deleted or the link might be wrong."
- **Triggers**: Direct link to a deleted trip, mistyped URL, listener fires on a removed group.
- **Affected screens**: `/trips/[id]`.
- **Debugging**:
  1. Firestore → `groups/{id}` — does the doc exist?
  2. Look at the activity feed of any group the user belongs to for `group.deleted` (none today; we hard-delete).
- **Recovery**: Ask an admin to recreate or share an invite link to the new trip.

### `ERR-GRP-403` — you don't have access to this trip

- **User sees**: "You don't have access to this trip. Ask a trip admin to invite you again with a fresh link."
- **Firebase code**: `permission-denied` from a Firestore read or write within the `group` domain.
- **Possible triggers**:
  - User's UID is not in the group's `memberIds` array.
  - User was removed by an admin and still has the page open.
  - Security rules not deployed yet.
  - Auth token expired mid-session.
- **Debugging steps**:
  1. Firestore → `groups/{groupId}` → check `memberIds` for the current user's UID.
  2. Firebase Console → **Authentication → Users** — verify the user is signed in with the same UID.
  3. Run `firebase deploy --only firestore:rules` to ensure the latest rules are live.
  4. Check the error log entry — the `context` field includes the failing `groupId`.
- **Recovery**:
  - Ask a trip admin to invite the user again.
  - Sign out and back in to refresh the ID token.

### `ERR-GRP-400` — invalid trip details

- **User sees**: "Please check the trip details. Some required fields look incomplete or invalid."
- **Triggers**: Form submitted with missing required fields (e.g. empty trip name).
- **Recovery**: Fill in the highlighted fields and resubmit.

### `ERR-GRP-500` — couldn't delete this trip

- **User sees**: "Couldn't delete this trip. Please try again in a moment. Only admins can delete trips."
- **Triggers**: Network failure mid-cascade-delete; rule rejection (caller not admin).
- **Debugging**:
  1. Verify the caller's UID is in `groups/{id}.adminIds`.
  2. Look at the dev logs — failed batches will be logged with the failing path.
- **Recovery**: Retry. If subcollections are partially deleted, rerunning is idempotent.

---

## Expense errors

### `ERR-EXP-400` — invalid expense

- **User sees**: "Please check the expense details. Make sure the amount and split values add up correctly."
- **Triggers**: Split totals don't match the expense amount; percentages don't sum to 100; shares are all zero.
- **Affected actions**: Add expense, edit expense.
- **Debugging**: The expense form surfaces the exact mismatch above the submit button. The structured log entry includes the validation message.
- **Recovery**: Fix the highlighted values.

### `ERR-EXP-403` — can't change this expense

- **User sees**: "You can't change this expense. Only the person who added it or a trip admin can edit or delete it."
- **Firebase code**: `permission-denied` from `groups/{id}/expenses/{eid}` write.
- **Triggers**: Caller is neither the `createdBy` of the expense nor a group admin.
- **Recovery**: Ask the original creator or an admin to make the change.

### `ERR-EXP-404` — expense no longer exists

- **Firebase code**: `not-found` from a transaction.
- **Triggers**: Two users editing simultaneously and one deleted it just before the other's save.
- **Recovery**: Refresh the trip list; the expense will already be gone.

### `ERR-EXP-500` — couldn't save this expense

- **Triggers**: Transient network error or Firestore unavailability.
- **Debugging**: Inspect the dev log for the underlying `firebaseCode`. Common culprits: `unavailable`, `aborted`.
- **Recovery**: Retry — `AppError.retryable` is `true` so retry surfaces aren't suppressed.

---

## Settlement errors

### `ERR-STL-400` — invalid settlement amount

- **User sees**: "Please check the settlement amount. Enter a valid amount greater than zero."
- **Triggers**: Amount field empty, zero, or non-numeric.
- **Recovery**: Enter a positive amount.

### `ERR-STL-403` — can't record this settlement

- **Firebase code**: `permission-denied` from `groups/{id}/settlements`.
- **Triggers**: Caller isn't a member of the trip.
- **Recovery**: Same as `ERR-GRP-403` — re-invite, or sign out and back in.

### `ERR-STL-500` — couldn't record this settlement

- **Triggers**: Same family as `ERR-EXP-500`.
- **Recovery**: Retry. If repeated, check the dev console — the suspect is usually a stale auth token or temporary Firestore unavailability.

---

## Invitation errors

### `ERR-INV-404` — invite not found

- **User sees**: "Invite not found. This invite link looks invalid. Ask the sender for a new one."
- **Triggers**: Bad code in the URL, invite was deleted, the trip itself was deleted (cascade-removes invites).
- **Affected screen**: `/invite/[code]`.
- **Debugging**:
  1. Firestore → `invitations/{code}` — does it exist?
  2. If yes, check `groupId` — does the group still exist?
- **Recovery**: Ask the inviter to send a fresh link.

### `ERR-INV-410` — invite was revoked

- **User sees**: "This invite was revoked. Ask the trip admin for a fresh invite link."
- **Triggers**: Status flipped to `revoked` (manually or via group deletion).
- **Recovery**: Ask for a new invite.

### `ERR-INV-419` — invite expired

- **Note**: Reserved — Dutch It doesn't expire invites today. Wired up so future TTL logic can use the same code.

### `ERR-INV-409` — invite already used

- **User sees**: "Invite already used. You're already a member of this trip — opening it now."
- **Behavior**: Treated as a happy redirect to `/trips/{groupId}`, not an error toast.
- **Triggers**: The same invite code was accepted earlier (often by the same user from another device).

### `ERR-INV-403` — can't create invites for this trip

- **Triggers**: Non-member tried to call `createInvitation`. Should be impossible from the UI but rules block it as a safety net.
- **Recovery**: Add the user to the trip first.

### `ERR-INV-500` — couldn't create the invite link

- **Triggers**: Network failure during invite create.
- **Recovery**: Retry.

---

## User profile errors

### `ERR-USR-500` — couldn't sync your profile

- **User sees**: "Couldn't sync your profile. We'll retry automatically. You can keep using the app in the meantime."
- **Triggers**: First-login `users/{uid}` upsert failed (rule mismatch, transient Firestore issue).
- **Behavior**: Non-blocking — auth state is preserved, just the denormalized profile didn't sync.
- **Recovery**: Reload the app. If it persists, confirm the `users/{uid}` rule allows `request.auth.uid == uid`.

---

## Network / infra errors

### `ERR-NET-503` — you're offline

- **User sees**: A persistent banner at the top + a non-destructive toast for any failed action.
- **Detected via**: `navigator.onLine` plus `window.online` / `window.offline` events.
- **Recovery**: Reconnect. The Firestore SDK will resync when back online.

### `ERR-NET-504` — that took too long

- **Firebase code**: `deadline-exceeded`, `cancelled`.
- **Recovery**: Retry. If repeated, check Firebase status.

### `ERR-NET-500` — service temporarily unavailable

- **Firebase code**: `unavailable`.
- **Recovery**: Wait a moment and retry. Confirm <https://status.firebase.google.com>.

---

## Configuration errors

### `ERR-CFG-001` — app isn't configured yet

- **User sees**: "App isn't configured yet. Missing connection settings. If you're the developer, see the README to set up environment variables."
- **Triggers**: Any of the `NEXT_PUBLIC_FIREBASE_*` env vars are missing.
- **Affected screens**: Any — thrown the moment the Firebase SDK is asked to initialise.
- **Recovery (developer)**:
  1. `cp .env.example .env.local`
  2. Fill the `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId` from Firebase Console → Project settings → Your apps.
  3. Restart the dev server (`npm run dev`).

---

## Generic errors

### `ERR-APP-500` — something went wrong

- **User sees**: "Something went wrong. An unexpected issue occurred. Please try again in a moment."
- **Triggers**: Anything not yet mapped to a more specific code.
- **Debugging**: The dev log will include the original cause under `cause`. If you see this code in production, please add a more specific mapping in `lib/errors/firebase-error-map.ts`.

---

## Adding a new error code

1. Add a constant to `lib/errors/error-codes.ts`.
2. Add a `USER_MESSAGES` entry in `lib/errors/user-messages.ts`. Avoid jargon — the test suite enforces this.
3. If it's mappable from a Firebase error, add it to the appropriate switch in `lib/errors/firebase-error-map.ts`.
4. Add a section to **this file** with debugging + recovery steps.
5. Run `npm test` — the user-messages test will tell you if you accidentally leaked technical wording.

## Reading production logs

- Each log line in production is a single-line JSON document with `ts`, `level`, `scope`, `message`, and `data`.
- Filter by `scope`: `auth`, `firestore`, `firebase`, `error`.
- The `error` scope includes the structured `AppError` (with the code and context) plus a sanitised `cause` that surfaces the original Firebase code if any.
- Search for `code: "ERR-..."` to find every occurrence of a specific error.

## Reproducing a Firestore permission error locally

1. Edit `firestore.rules` to make the matching rule deliberately strict.
2. `firebase emulators:start --only firestore` (you'll need the Firebase CLI).
3. Point the app at the emulator by adding to `lib/firebase/client.ts` (gated behind a dev flag) — see Firebase docs.
4. Trigger the action; the structured log will have `firebaseCode: "permission-denied"` under the cause and the user will see the friendly version.
