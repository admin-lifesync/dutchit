# Settlement Engine Fix — Bugfix Design

## Overview

Dutch.it has two intertwined bugs in its settlement subsystem. First, the settlement mode
(`direct` vs `minimized`) is stored only in local React state, so every user sees a
different mode and it resets on every page load — there is no shared, persisted source of
truth. Second, settlements are recorded unilaterally by the sender with no receiver
confirmation, no `status` field, and no lifecycle — every written `SettlementDoc`
immediately shifts all members' balances even if the money was never actually transferred.

This fix introduces:
1. A `settlementMode` field on `GroupDoc`, admin-controlled and Firestore-persisted.
2. Two clearly-named calculation engines: `calculateDirectSettlements()` and
   `calculateMinimizedSettlements()`, replacing the ad-hoc calls to
   `grossDirectedOwingFromExpenses()` and `simplifyDebts()` in the panel.
3. A full approval lifecycle on `SettlementDoc` (`pending → accepted | rejected | cancelled`).
4. Balance calculations that filter to `status === "accepted"` settlements only.
5. Duplicate-settlement prevention via a pre-write pending-check.
6. Activity feed entries for every settlement lifecycle event.
7. Updated UI components: status badges, a receiver "Pending Actions" panel, and a
   sender status view.
8. Tightened Firestore security rules that enforce the lifecycle server-side.


## Glossary

- **Bug_Condition C(X)**: The set of inputs that trigger either bug — a group whose
  `settlementMode` is `undefined`, or a `SettlementDoc` whose `status` is not `"accepted"`.
- **Property P(result)**: The desired correct behavior for those inputs — mode is read from
  Firestore and is admin-gated; only accepted settlements affect balances.
- **Preservation**: All behaviors that must remain unchanged — expense balance math,
  accepted-settlement balance shifts, the "All settled up" empty state, currency formatting,
  and the greedy minimization algorithm itself.
- **`calculateDirectSettlements(expenses)`**: New public name for the direct-ledger engine.
  Wraps `grossDirectedOwingFromExpenses()`. Returns transfers derived purely from expense
  `splitValues` — no cross-group debt merging.
- **`calculateMinimizedSettlements(balances)`**: New public name for the greedy optimizer.
  Wraps `simplifyDebts()`. Returns at most N-1 transfers from net balances.
- **`SettlementStatus`**: Union type `"pending" | "accepted" | "rejected" | "cancelled"`.
- **`settlementMode`**: Field on `GroupDoc` — `"direct" | "minimized"`, defaults to
  `"direct"` for legacy groups that lack the field.
- **Receiver**: The `toUid` on a `SettlementDoc` — the person who is owed money and must
  confirm receipt.
- **Sender**: The `fromUid` on a `SettlementDoc` — the person claiming to have paid.
- **Admin**: A user whose `uid` appears in `group.adminIds`.


## Bug Details

### Bug Condition

**Bug 1 — Mode not persisted:**
The bug manifests when `group.settlementMode` is `undefined` (all existing groups) or when
a non-admin user is able to interact with the mode toggle. The `SettlementPanel` reads from
local `useState`, so two users viewing the same trip simultaneously can be in different modes
with no shared authority.

```
FUNCTION isBugCondition_Mode(group, viewerUid)
  INPUT: group: GroupDoc, viewerUid: string
  OUTPUT: boolean

  RETURN group.settlementMode = undefined
      OR (viewerUid NOT IN group.adminIds AND modeToggleIsInteractive)
END FUNCTION
```

**Bug 2 — No approval lifecycle:**
The bug manifests when a `SettlementDoc` is written without a `status` field, or when
`calculateBalances()` is called with settlements that include non-accepted entries.

```
FUNCTION isBugCondition_Settlement(settlement)
  INPUT: settlement: SettlementDoc
  OUTPUT: boolean

  RETURN settlement.status = undefined
      OR settlement.status != "accepted"
END FUNCTION
```

### Examples

- **Mode reset**: Alice (admin) switches to Minimized. Bob opens the trip — he sees Direct
  (local default). Alice's choice is lost on her next reload. → Fixed: mode is read from
  `group.settlementMode`.
- **Unilateral settlement**: Alice clicks "Mark paid ₹1000 to Bob." Bob never received the
  money. Alice's balance immediately improves by ₹1000. → Fixed: settlement is `pending`
  until Bob accepts.
- **Duplicate claim**: Alice clicks "Mark paid" twice before the UI disables the button.
  Two `SettlementDoc`s are written, double-counting ₹2000. → Fixed: pre-write check for
  existing `pending` settlement between the same pair.
- **Non-admin mode switch**: Carol (member) switches to Minimized and records a payment.
  The group's settlement strategy is changed without admin consent. → Fixed: toggle is
  read-only for non-admins; Firestore rule rejects `settlementMode` writes from non-admins.


## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Expense creation, editing, and deletion continue to recalculate `paid`/`owed`/`net`
  balances correctly via `calculateBalances()`.
- Accepted settlements continue to shift the sender's net balance upward and the receiver's
  net balance downward by the settled amount (same math as today, just gated on `status`).
- The "All settled up" empty state renders when the active transfer list is empty.
- Group admins continue to see the mode toggle (now persisted and Firestore-backed).
- Minimized mode continues to use the greedy creditor/debtor algorithm (`simplifyDebts`),
  producing at most N-1 transfers.
- Positive net balance continues to display as "Should receive"; negative as "Should pay in".
- Settlement history continues to show actor names, amounts, timestamps, and notes — now
  augmented with status badges.
- All settlement amounts continue to be formatted using the group's currency.
- Members not involved in a transfer continue to see all transfers in the panel.

**Scope:**
All inputs that do NOT involve the settlement mode field or settlement status are completely
unaffected. This includes: expense CRUD, member join/leave flows, invite code rotation,
join-request approval, and the activity feed for non-settlement events.


## Hypothesized Root Cause

### Bug 1 — Mode not persisted

1. **Local state only**: `SettlementPanel` uses `useState<SettlementViewMode>("direct")`.
   There is no read from or write to `GroupDoc`. Every mount resets to `"direct"`.

2. **No admin gate on the toggle**: Both tab buttons are always interactive regardless of
   `isAdmin`. The existing `isAdmin` check only gates the "Mark paid" action in Minimized
   mode, not the mode switch itself.

3. **No `settlementMode` field on `GroupDoc`**: The TypeScript type and Firestore schema
   have no such field, so there is nowhere to persist the choice even if the UI tried.

4. **Firestore rule branch 3 (member bookkeeping) is too permissive**: It allows any member
   to update `updatedAt` and counters but does not enumerate `settlementMode`, so a member
   could write it today without a rule violation. The rule must be tightened to explicitly
   allow only admins to change `settlementMode`.

### Bug 2 — No approval lifecycle

1. **`SettlementDoc` has no `status` field**: The TypeScript type and Firestore schema omit
   `status`, `acceptedAt`, `rejectedAt`, `acceptedBy`, and `updatedAt`. There is no
   lifecycle to enforce.

2. **`createSettlement()` writes immediately and fully**: It calls `setDoc` with no
   `status`, then immediately logs `settlement.created`. The balance impact is instant.

3. **`calculateBalances()` applies all settlements unconditionally**: The loop over
   `settlements` has no filter — every doc shifts balances regardless of whether the
   receiver confirmed receipt.

4. **No duplicate check**: `createSettlement()` does not query for an existing `pending`
   settlement between the same `fromUid`/`toUid` pair before writing.

5. **Security rules allow any member to update any settlement they created**: The current
   rule `allow update, delete: if memberOfParent() && (resource.data.createdBy == request.auth.uid || adminOfParent())` does not distinguish between the sender accepting their own
   settlement (which should be forbidden) and the receiver accepting it (which is the only
   valid accept path).


## Correctness Properties

Property 1: Bug Condition — Mode Persistence and Admin Gate

_For any_ group where `isBugCondition_Mode` holds (mode is `undefined` or a non-admin can
toggle it), the fixed `SettlementPanel` SHALL read `settlementMode` from `group.settlementMode`
(defaulting to `"direct"` for legacy groups), SHALL render the mode toggle as interactive
only when the viewer is in `group.adminIds`, and SHALL persist any admin mode change to
Firestore before updating local UI state.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Bug Condition — Balance Isolation for Non-Accepted Settlements

_For any_ set of settlements where `isBugCondition_Settlement` holds (any settlement has
`status !== "accepted"`), the fixed `calculateBalances()` SHALL produce the same result as
calling the original `calculateBalances()` with only the `status === "accepted"` subset —
i.e., pending, rejected, and cancelled settlements SHALL have zero effect on any member's
`paid`, `owed`, or `net` values.

**Validates: Requirements 2.7, 2.9, 2.10, 2.11, 2.12**

Property 3: Preservation — Accepted Settlements Shift Balances Identically

_For any_ settlement where `status === "accepted"`, the fixed `calculateBalances()` SHALL
produce exactly the same `paid`/`owed`/`net` values as the original `calculateBalances()`
for that settlement, preserving the invariant that the sender's net increases and the
receiver's net decreases by `settlement.amount`.

**Validates: Requirements 3.1, 3.2**

Property 4: Preservation — Direct Engine Produces No Cross-Party Merges

_For any_ set of expenses, `calculateDirectSettlements(expenses)` SHALL produce a transfer
list where every transfer's `fromUid` and `toUid` correspond to a non-payer and payer
relationship that exists in at least one expense's `splitValues` — it SHALL NOT produce a
transfer between two members who have no direct expense relationship (no cross-group debt
merging).

**Validates: Requirements 2.4, 2.6, 3.5**

Property 5: Preservation — Minimized Engine Produces At Most N-1 Transfers

_For any_ set of member balances with N members having non-zero net balances,
`calculateMinimizedSettlements(balances)` SHALL produce at most N-1 transfers and the sum
of all transfer amounts SHALL equal the sum of all positive net balances (total credit =
total debit).

**Validates: Requirements 2.5, 3.5**


## Fix Implementation

### Changes Required

#### 1. `lib/firebase/types.ts` — Schema updates

**`GroupDoc`** — add one field:
```typescript
/** Persisted settlement calculation mode. Defaults to "direct" for legacy groups. */
settlementMode?: "direct" | "minimized";
```

**`SettlementDoc`** — add lifecycle fields:
```typescript
export type SettlementStatus = "pending" | "accepted" | "rejected" | "cancelled";

// Replace the existing SettlementDoc interface:
export interface SettlementDoc {
  id: string;
  groupId: string;
  fromUid: string;
  toUid: string;
  amount: number;
  currency: string;
  note: string;
  status: SettlementStatus;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  acceptedAt: Timestamp | null;
  acceptedBy: string | null;
  rejectedAt: Timestamp | null;
}
```

**`ActivityType`** — add new event types:
```typescript
| "settlement.accepted"
| "settlement.rejected"
| "settlement.cancelled"
```

**New error codes** in `lib/errors/error-codes.ts`:
```typescript
STL_DUPLICATE_PENDING: "ERR-STL-409",
STL_NOT_FOUND: "ERR-STL-404",
STL_INVALID_TRANSITION: "ERR-STL-422",
```


#### 2. `lib/balance/calculate.ts` — Named engine wrappers

Add two public wrapper functions that give the engines stable, spec-aligned names. The
underlying algorithms (`grossDirectedOwingFromExpenses` and `simplifyDebts`) are preserved
unchanged to satisfy Property 4 and Property 5.

```typescript
/**
 * Direct settlement engine: transfers derived from the raw expense ledger.
 * Each non-payer owes the payer their share on that specific expense.
 * No cross-group debt merging. Wraps grossDirectedOwingFromExpenses().
 */
export function calculateDirectSettlements(expenses: ExpenseDoc[]): Transfer[] {
  return grossDirectedOwingFromExpenses(expenses);
}

/**
 * Minimized settlement engine: greedy creditor/debtor pairing from net balances.
 * Produces at most N-1 transfers. Wraps simplifyDebts().
 */
export function calculateMinimizedSettlements(balances: MemberBalance[]): Transfer[] {
  return simplifyDebts(balances);
}
```

**`calculateBalances()` — filter to accepted only:**

Change the settlement loop from:
```typescript
for (const s of settlements) {
```
to:
```typescript
for (const s of settlements.filter(s => s.status === "accepted")) {
```

This is the single-line fix for Property 2 and Property 3. Legacy `SettlementDoc`s without
a `status` field (written before this fix) are treated as accepted via a fallback:
```typescript
for (const s of settlements.filter(s => (s.status ?? "accepted") === "accepted")) {
```


#### 3. `lib/firebase/firestore.ts` — Settlement lifecycle functions

**`createSettlement()` — write with `status: "pending"` and duplicate check:**

```typescript
export async function createSettlement(
  input: CreateSettlementInput,
  actorName: string
): Promise<string> {
  // Duplicate check: query for existing pending settlement between same pair
  const existingQ = query(
    col.settlements(input.groupId),
    where("fromUid", "==", input.fromUid),
    where("toUid", "==", input.toUid),
    where("status", "==", "pending"),
    limit(1)
  );
  const existing = await getDocs(existingQ);
  if (!existing.empty) {
    throw new AppError(ERROR_CODES.STL_DUPLICATE_PENDING, {
      context: { groupId: input.groupId, fromUid: input.fromUid, toUid: input.toUid },
    });
  }

  const ref = doc(col.settlements(input.groupId));
  await setDoc(ref, {
    ...input,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    acceptedAt: null,
    acceptedBy: null,
    rejectedAt: null,
  });
  // group.updatedAt bump and activity log remain the same
  await updateDoc(doc(col.groups(), input.groupId), { updatedAt: serverTimestamp() });
  await logActivitySafe(input.groupId, {
    type: "settlement.created",
    actorUid: input.createdBy,
    actorName,
    message: `${actorName} sent a payment request`,
    meta: { from: input.fromUid, to: input.toUid, amount: input.amount },
  });
  return ref.id;
}
```

**New `acceptSettlement(groupId, settlementId, actor)`:**
- Reads the doc, asserts `status === "pending"` and `actor.uid === settlement.toUid`.
- Writes `{ status: "accepted", acceptedAt: serverTimestamp(), acceptedBy: actor.uid, updatedAt: serverTimestamp() }`.
- Logs `settlement.accepted` activity.

**New `rejectSettlement(groupId, settlementId, actor)`:**
- Reads the doc, asserts `status === "pending"` and `actor.uid === settlement.toUid`.
- Writes `{ status: "rejected", rejectedAt: serverTimestamp(), updatedAt: serverTimestamp() }`.
- Logs `settlement.rejected` activity.

**New `cancelSettlement(groupId, settlementId, actor)`:**
- Reads the doc, asserts `status === "pending"` and (`actor.uid === settlement.fromUid` OR actor is admin).
- Writes `{ status: "cancelled", updatedAt: serverTimestamp() }`.
- Logs `settlement.cancelled` activity.

**New `setSettlementMode(groupId, mode, actorUid)`:**
- Calls `updateDoc` on the group with `{ settlementMode: mode, updatedAt: serverTimestamp() }`.
- Caller must be admin (enforced by Firestore rule; client also checks before calling).


#### 4. `hooks/use-trip.ts` — No change to data fetching

`watchSettlements` already returns all docs. The balance filter is applied inside
`calculateBalances()`, so `useTrip` needs no changes. The hook will naturally surface
pending settlements to the UI for the receiver's action panel.

#### 5. `components/settlements/settlement-panel.tsx` — Mode persistence + status UI

**Mode toggle:**
- Remove `useState<SettlementViewMode>("direct")`.
- Read initial mode from `group.settlementMode ?? "direct"`.
- On tab click (admin only): call `setSettlementMode(group.id, newMode, user.uid)` then
  update local state optimistically.
- Non-admin: render the tab strip as `aria-disabled` with a tooltip explaining admin-only.

**Pending Actions panel (receiver view):**
- New section rendered above the transfer list when `settlements.some(s => s.status === "pending" && s.toUid === user.uid)`.
- Shows a `PendingSettlementCard` for each such settlement with Accept and Reject buttons.
- Accept calls `acceptSettlement()`; Reject calls `rejectSettlement()`.

**Sender status view:**
- In the settlement history list, settlements with `status === "pending"` show a "Pending
  confirmation" badge and a Cancel button (calls `cancelSettlement()`).
- `status === "accepted"` shows a green "Accepted" badge.
- `status === "rejected"` shows a red "Rejected" badge.
- `status === "cancelled"` shows a muted "Cancelled" badge.

**New `PendingSettlementCard` component** (`components/settlements/pending-settlement-card.tsx`):
- Props: `settlement: SettlementDoc`, `group: GroupDoc`, `onAccept: () => void`,
  `onReject: () => void`, `isActing: boolean`.
- Dark fintech aesthetic: card with amber border accent for pending state, sender avatar,
  amount in large mono font, Accept (primary) and Reject (destructive outline) buttons.

**Updated `SettlementTransferCard`:**
- Add optional `status?: SettlementStatus` prop for history rows.
- Render a `Badge` variant mapped from status: `pending → warning`, `accepted → success`,
  `rejected → destructive`, `cancelled → secondary`.


#### 6. `components/trips/activity-feed.tsx` — New activity icons

Add icon mappings for the three new `ActivityType` values:

```typescript
"settlement.accepted": CheckCircle2,   // green
"settlement.rejected": XCircle,        // red
"settlement.cancelled": MinusCircle,   // muted
```

#### 7. `firestore.rules` — Tightened settlement lifecycle rules

Replace the current settlements block with role-aware transition rules:

```
match /settlements/{settlementId} {
  function parentGroup() { ... }  // same as today
  function memberOfParent() { ... }
  function adminOfParent() { ... }
  function isSender()   { return request.auth.uid == resource.data.fromUid; }
  function isReceiver() { return request.auth.uid == resource.data.toUid; }

  allow read: if memberOfParent();

  // Create: any member, must set status=pending, must be the sender
  allow create: if memberOfParent()
    && request.resource.data.createdBy == request.auth.uid
    && request.resource.data.groupId == groupId
    && request.resource.data.status == "pending"
    && request.resource.data.fromUid == request.auth.uid;

  // Accept/Reject: only the receiver, only from pending
  allow update: if memberOfParent()
    && resource.data.status == "pending"
    && (
      // Receiver accepts
      (isReceiver()
        && request.resource.data.status == "accepted"
        && request.resource.data.fromUid == resource.data.fromUid
        && request.resource.data.toUid == resource.data.toUid
        && request.resource.data.amount == resource.data.amount)
      ||
      // Receiver rejects
      (isReceiver()
        && request.resource.data.status == "rejected"
        && request.resource.data.fromUid == resource.data.fromUid
        && request.resource.data.toUid == resource.data.toUid
        && request.resource.data.amount == resource.data.amount)
      ||
      // Sender or admin cancels
      ((isSender() || adminOfParent())
        && request.resource.data.status == "cancelled"
        && request.resource.data.fromUid == resource.data.fromUid
        && request.resource.data.toUid == resource.data.toUid
        && request.resource.data.amount == resource.data.amount)
    );

  // Delete: only admins (for cleanup)
  allow delete: if adminOfParent();
}
```

**Group rule branch 3 (member bookkeeping)** — add explicit exclusion of `settlementMode`:
```
&& nextGroup().get('settlementMode', 'direct') == group().get('settlementMode', 'direct')
```
This ensures non-admins cannot change the mode via a bookkeeping update.


## Testing Strategy

### Validation Approach

Testing follows a two-phase approach: first run exploratory tests against the **unfixed**
code to surface counterexamples and confirm root cause analysis; then run fix-checking and
preservation tests against the **fixed** code.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate both bugs on unfixed code. Confirm or
refute the root cause analysis.

**Test Plan**: Write unit tests that call the existing functions with inputs that should
trigger the bugs, then assert the correct (fixed) behavior — these assertions will fail on
unfixed code, giving us the counterexamples.

**Test Cases**:

1. **Mode not persisted** (will fail on unfixed code): Mount `SettlementPanel` with a group
   that has `settlementMode: "minimized"`. Assert that the rendered tab strip shows
   Minimized as selected. On unfixed code, the component ignores `group.settlementMode` and
   defaults to `"direct"`.

2. **Non-admin can toggle mode** (will fail on unfixed code): Mount `SettlementPanel` with
   a non-admin user. Assert that the mode tab buttons are `aria-disabled`. On unfixed code,
   both buttons are always interactive.

3. **Pending settlement shifts balance** (will fail on unfixed code): Call
   `calculateBalances(memberIds, expenses, [pendingSettlement])` where
   `pendingSettlement.status = "pending"`. Assert that the result equals
   `calculateBalances(memberIds, expenses, [])`. On unfixed code, the pending settlement
   shifts balances.

4. **Duplicate settlement allowed** (will fail on unfixed code): Call `createSettlement()`
   twice with the same `fromUid`/`toUid`. Assert the second call throws
   `ERR-STL-409`. On unfixed code, two docs are written.

**Expected Counterexamples**:
- Mode tab renders "Direct" even when `group.settlementMode === "minimized"`.
- Non-admin user can click the mode tab and change the view.
- `calculateBalances` returns different values when a `pending` settlement is included vs
  excluded.
- Two `SettlementDoc`s exist for the same sender/receiver pair after two rapid submits.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions
produce the expected behavior.

**Pseudocode:**
```
FOR ALL group WHERE isBugCondition_Mode(group, viewerUid) DO
  result := renderSettlementPanel_fixed(group, viewerUid)
  ASSERT result.selectedMode == (group.settlementMode ?? "direct")
  ASSERT result.modeToggleInteractive == (viewerUid IN group.adminIds)
END FOR

FOR ALL settlement WHERE isBugCondition_Settlement(settlement) DO
  balances := calculateBalances_fixed(members, expenses, [settlement])
  ASSERT balances == calculateBalances_fixed(members, expenses, [])
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed
functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL settlement WHERE settlement.status == "accepted" DO
  ASSERT calculateBalances_original(members, expenses, [settlement])
       == calculateBalances_fixed(members, expenses, [settlement])
END FOR

FOR ALL expenses DO
  ASSERT calculateDirectSettlements_fixed(expenses)
       == grossDirectedOwingFromExpenses_original(expenses)
END FOR

FOR ALL balances DO
  ASSERT calculateMinimizedSettlements_fixed(balances)
       == simplifyDebts_original(balances)
END FOR
```

**Testing Approach**: Property-based testing is recommended for the balance filter and
engine wrappers because:
- It generates many random expense/settlement combinations automatically.
- It catches edge cases (zero amounts, single member, all-even balances) that manual tests
  miss.
- It provides strong guarantees that the `status` filter and engine wrappers are
  behaviorally identical to the originals for their respective input domains.

**Test Cases**:
1. **Accepted settlement preservation**: Generate random accepted settlements; verify
   `calculateBalances` result is unchanged after the fix.
2. **Direct engine wrapper identity**: Generate random expense lists; verify
   `calculateDirectSettlements` output equals `grossDirectedOwingFromExpenses` output.
3. **Minimized engine wrapper identity**: Generate random balance arrays; verify
   `calculateMinimizedSettlements` output equals `simplifyDebts` output.
4. **Legacy doc backward compat**: Generate settlements with no `status` field; verify they
   are treated as accepted (backward compatibility for existing data).

### Unit Tests

- `calculateBalances` with mixed-status settlements: only accepted ones affect balances.
- `calculateBalances` with legacy docs (no `status`): treated as accepted.
- `createSettlement` with existing pending pair: throws `ERR-STL-409`.
- `acceptSettlement` called by receiver: transitions to `accepted`, sets `acceptedAt`.
- `acceptSettlement` called by sender: throws `ERR-STL-403`.
- `rejectSettlement` called by receiver: transitions to `rejected`, sets `rejectedAt`.
- `cancelSettlement` called by sender: transitions to `cancelled`.
- `cancelSettlement` called by admin: transitions to `cancelled`.
- `cancelSettlement` called by receiver (non-admin): throws `ERR-STL-403`.
- `setSettlementMode` called by admin: persists to Firestore.
- Mode toggle renders as disabled for non-admin users.
- Pending Actions panel renders only for the receiver of pending settlements.
- Status badges render correct variant for each `SettlementStatus` value.

### Property-Based Tests

- **Balance filter property** (Property 2): For any array of settlements with random
  statuses, `calculateBalances(members, expenses, settlements)` equals
  `calculateBalances(members, expenses, settlements.filter(s => s.status === "accepted"))`.
- **Accepted preservation property** (Property 3): For any accepted settlement,
  `calculateBalances` with and without the fix produces identical output.
- **Direct engine identity** (Property 4): For any expense array,
  `calculateDirectSettlements(expenses)` deep-equals `grossDirectedOwingFromExpenses(expenses)`.
- **Minimized engine identity** (Property 5): For any balance array,
  `calculateMinimizedSettlements(balances)` deep-equals `simplifyDebts(balances)`.
- **Minimized transfer count** (Property 5): For any N members with non-zero balances,
  `calculateMinimizedSettlements` returns ≤ N-1 transfers.
- **Direct no cross-merge** (Property 4): For any expense array, every transfer in
  `calculateDirectSettlements` has a `fromUid`/`toUid` pair that appears as a
  non-payer/payer relationship in at least one expense.

### Integration Tests

- Full settlement lifecycle: sender creates → receiver sees pending → receiver accepts →
  balance shifts → activity feed shows all three events.
- Rejection flow: sender creates → receiver rejects → balance unchanged → activity logged.
- Cancellation flow: sender creates → sender cancels → balance unchanged → activity logged.
- Mode persistence: admin switches to Minimized → second user loads page → sees Minimized.
- Non-admin mode gate: non-admin cannot switch mode via UI or direct Firestore write.
- Duplicate prevention: two rapid "Mark paid" clicks produce one pending settlement, not two.
- Legacy data: existing `SettlementDoc`s without `status` continue to affect balances
  (backward compatibility).

