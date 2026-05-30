# Implementation Plan

## Overview

This task list implements the settlement engine fix for Dutch.it, addressing two intertwined bugs: settlement mode not being persisted to Firestore (local state only), and settlements being applied to balance calculations without receiver confirmation. The fix follows the exploratory bugfix workflow: write exploration tests first to confirm the bugs, write preservation tests to capture baseline behavior, then implement the fix in dependency order (schema → calculation → Firestore functions → security rules → UI components).

## Tasks

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** - Settlement Status Filter and Mode Persistence
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior — they will validate the fix when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate both bugs exist
  - **Scoped PBT Approach**: For the balance filter bug, scope the property to the concrete failing case: a single `SettlementDoc` with `status: "pending"` should have zero effect on balances
  - Test 1 — Balance isolation: call `calculateBalances(memberIds, expenses, [pendingSettlement])` where `pendingSettlement.status = "pending"` and assert the result equals `calculateBalances(memberIds, expenses, [])`. On unfixed code this FAILS because the loop has no status filter.
  - Test 2 — Mode not read from group: render `SettlementPanel` with `group.settlementMode = "minimized"` and assert the active tab is "minimized". On unfixed code this FAILS because the component ignores `group.settlementMode` and defaults to `"direct"`.
  - Test 3 — Non-admin can toggle mode: render `SettlementPanel` with a non-admin viewer and assert both mode tab buttons are `aria-disabled`. On unfixed code this FAILS because both buttons are always interactive.
  - Test 4 — Duplicate settlement allowed: call `createSettlement()` twice with the same `fromUid`/`toUid` and assert the second call throws `ERR-STL-409`. On unfixed code this FAILS because two docs are written.
  - Run all tests on UNFIXED code
  - **EXPECTED OUTCOME**: All four tests FAIL (this is correct — it proves the bugs exist)
  - Document counterexamples found (e.g., "calculateBalances returns different values when pending settlement included", "mode tab shows Direct even when group.settlementMode === 'minimized'")
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.5, 1.6, 1.1, 1.2, 1.8_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Accepted Settlements and Engine Wrapper Identity
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: `calculateBalances(members, expenses, [acceptedSettlement])` on unfixed code — record the exact `paid`/`owed`/`net` values
  - Observe: `grossDirectedOwingFromExpenses(expenses)` on unfixed code — record the transfer list
  - Observe: `simplifyDebts(balances)` on unfixed code — record the transfer list
  - Write property-based test A: for any settlement with `status === "accepted"`, `calculateBalances` with the fix produces identical `paid`/`owed`/`net` values as the original (from Preservation Requirements 3.1, 3.2 in design)
  - Write property-based test B: for any expense array, `calculateDirectSettlements(expenses)` deep-equals `grossDirectedOwingFromExpenses(expenses)` (from Property 4 in design)
  - Write property-based test C: for any balance array, `calculateMinimizedSettlements(balances)` deep-equals `simplifyDebts(balances)` (from Property 5 in design)
  - Write property-based test D: for any settlement with no `status` field (legacy doc), `calculateBalances` treats it as accepted — backward compatibility (from design legacy fallback)
  - Verify all four tests PASS on UNFIXED code (they test preserved behavior, not the bug)
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.5_

- [x] 3. Schema updates — types and error codes

  - [x] 3.1 Add `settlementMode` field to `GroupDoc` in `lib/firebase/types.ts`
    - Add optional field: `settlementMode?: "direct" | "minimized"`
    - Add JSDoc: "Persisted settlement calculation mode. Defaults to 'direct' for legacy groups."
    - _Bug_Condition: isBugCondition_Mode(group) where group.settlementMode = undefined_
    - _Expected_Behavior: group.settlementMode is read from Firestore; UI defaults to "direct" for legacy groups_
    - _Requirements: 2.1, 2.3_

  - [x] 3.2 Add `SettlementStatus` type and lifecycle fields to `SettlementDoc` in `lib/firebase/types.ts`
    - Export new type: `export type SettlementStatus = "pending" | "accepted" | "rejected" | "cancelled"`
    - Add to `SettlementDoc`: `status: SettlementStatus`, `updatedAt: Timestamp`, `acceptedAt: Timestamp | null`, `acceptedBy: string | null`, `rejectedAt: Timestamp | null`
    - _Bug_Condition: isBugCondition_Settlement(settlement) where settlement.status = undefined_
    - _Expected_Behavior: every SettlementDoc carries a status field; only "accepted" docs affect balances_
    - _Requirements: 2.7, 2.9, 2.10, 2.11_

  - [x] 3.3 Add new `ActivityType` values in `lib/firebase/types.ts`
    - Extend `ActivityType` union with: `"settlement.accepted"`, `"settlement.rejected"`, `"settlement.cancelled"`
    - _Requirements: 2.13_

  - [x] 3.4 Add new error codes in `lib/errors/error-codes.ts`
    - Add under the Settlements section: `STL_DUPLICATE_PENDING: "ERR-STL-409"`, `STL_NOT_FOUND: "ERR-STL-404"`, `STL_INVALID_TRANSITION: "ERR-STL-422"`
    - Add matching user-facing messages in `lib/errors/user-messages.ts`
    - _Requirements: 2.14_

- [x] 4. Balance calculation fix — `lib/balance/calculate.ts`

  - [x] 4.1 Filter `calculateBalances()` to accepted-only settlements
    - Change the settlement loop from `for (const s of settlements)` to `for (const s of settlements.filter(s => (s.status ?? "accepted") === "accepted"))`
    - The `?? "accepted"` fallback preserves backward compatibility for legacy docs without a `status` field
    - _Bug_Condition: isBugCondition_Settlement(settlement) where settlement.status != "accepted"_
    - _Expected_Behavior: pending/rejected/cancelled settlements have zero effect on paid/owed/net_
    - _Preservation: accepted settlements continue to shift sender net up and receiver net down by settlement.amount_
    - _Requirements: 2.12, 3.1, 3.2_

  - [x] 4.2 Add `calculateDirectSettlements()` wrapper in `lib/balance/calculate.ts`
    - Export new function: `export function calculateDirectSettlements(expenses: ExpenseDoc[]): Transfer[]`
    - Body: `return grossDirectedOwingFromExpenses(expenses)`
    - Add JSDoc explaining it wraps `grossDirectedOwingFromExpenses` with no cross-group debt merging
    - _Requirements: 2.4, 2.6_

  - [x] 4.3 Add `calculateMinimizedSettlements()` wrapper in `lib/balance/calculate.ts`
    - Export new function: `export function calculateMinimizedSettlements(balances: MemberBalance[]): Transfer[]`
    - Body: `return simplifyDebts(balances)`
    - Add JSDoc explaining it wraps `simplifyDebts`, producing at most N-1 transfers
    - _Requirements: 2.5, 3.5_

- [x] 5. Firestore functions — settlement lifecycle in `lib/firebase/firestore.ts`

  - [x] 5.1 Update `createSettlement()` with `status: "pending"` and duplicate check
    - Before writing, query `col.settlements(input.groupId)` with `where("fromUid", "==", input.fromUid)`, `where("toUid", "==", input.toUid)`, `where("status", "==", "pending")`, `limit(1)`
    - If the query returns a non-empty snapshot, throw `new AppError(ERROR_CODES.STL_DUPLICATE_PENDING, { context: { groupId, fromUid, toUid } })`
    - Write the doc with `status: "pending"`, `updatedAt: serverTimestamp()`, `acceptedAt: null`, `acceptedBy: null`, `rejectedAt: null`
    - Update activity log message to `"${actorName} sent a payment request"`
    - Update `CreateSettlementInput` type to omit `status`, `updatedAt`, `acceptedAt`, `acceptedBy`, `rejectedAt` (set by the function)
    - _Bug_Condition: isBugCondition_Settlement(settlement) where settlement.status = undefined_
    - _Expected_Behavior: new settlements are created with status "pending"; duplicate pending pair throws ERR-STL-409_
    - _Requirements: 2.7, 2.14_

  - [x] 5.2 Add `acceptSettlement(groupId, settlementId, actor)` to `lib/firebase/firestore.ts`
    - Read the settlement doc; throw `ERR-STL-NOT_FOUND` if missing
    - Assert `settlement.status === "pending"` — throw `ERR-STL-422` otherwise
    - Assert `actor.uid === settlement.toUid` — throw `ERR-STL-403` if the caller is not the receiver
    - Write `{ status: "accepted", acceptedAt: serverTimestamp(), acceptedBy: actor.uid, updatedAt: serverTimestamp() }`
    - Log `settlement.accepted` activity: `"${actor.name} confirmed receipt of payment"`
    - _Requirements: 2.9_

  - [x] 5.3 Add `rejectSettlement(groupId, settlementId, actor)` to `lib/firebase/firestore.ts`
    - Read the settlement doc; throw `ERR-STL-NOT_FOUND` if missing
    - Assert `settlement.status === "pending"` — throw `ERR-STL-422` otherwise
    - Assert `actor.uid === settlement.toUid` — throw `ERR-STL-403` if the caller is not the receiver
    - Write `{ status: "rejected", rejectedAt: serverTimestamp(), updatedAt: serverTimestamp() }`
    - Log `settlement.rejected` activity: `"${actor.name} declined a payment request"`
    - _Requirements: 2.10_

  - [x] 5.4 Add `cancelSettlement(groupId, settlementId, actor, isAdmin)` to `lib/firebase/firestore.ts`
    - Read the settlement doc; throw `ERR-STL-NOT_FOUND` if missing
    - Assert `settlement.status === "pending"` — throw `ERR-STL-422` otherwise
    - Assert `actor.uid === settlement.fromUid || isAdmin` — throw `ERR-STL-403` otherwise
    - Write `{ status: "cancelled", updatedAt: serverTimestamp() }`
    - Log `settlement.cancelled` activity: `"${actor.name} cancelled a payment request"`
    - _Requirements: 2.11_

  - [x] 5.5 Add `setSettlementMode(groupId, mode, actorUid)` to `lib/firebase/firestore.ts`
    - Call `updateDoc` on the group with `{ settlementMode: mode, updatedAt: serverTimestamp() }`
    - Caller must be admin — enforced by Firestore rule; client also checks before calling
    - _Requirements: 2.1_

- [x] 6. Firestore security rules — `firestore.rules`

  - [x] 6.1 Replace the settlements subcollection rules with lifecycle-aware role rules
    - Add helper functions `isSender()` and `isReceiver()` inside the settlements match block
    - `allow create`: member only, must set `status == "pending"`, `fromUid == request.auth.uid`, `createdBy == request.auth.uid`
    - `allow update`: member only, current `status == "pending"`, then branch: receiver can accept (status → "accepted") or reject (status → "rejected") with immutable fromUid/toUid/amount; sender or admin can cancel (status → "cancelled") with immutable fromUid/toUid/amount
    - `allow delete`: admin only
    - Preserve `allow read: if memberOfParent()`
    - _Requirements: 2.7, 2.9, 2.10, 2.11_

  - [x] 6.2 Tighten group rule branch 3 (member bookkeeping) to exclude `settlementMode`
    - Add to branch 3's conditions: `&& nextGroup().get('settlementMode', 'direct') == group().get('settlementMode', 'direct')`
    - This prevents non-admins from changing `settlementMode` via a bookkeeping update
    - _Requirements: 2.2_

- [x] 7. Settlement panel UI — `components/settlements/settlement-panel.tsx`

  - [x] 7.1 Remove local mode state and read from `group.settlementMode`
    - Remove `useState<SettlementViewMode>("direct")`
    - Replace with: `const [mode, setMode] = useState<SettlementViewMode>(group.settlementMode ?? "direct")`
    - Add `useEffect` to sync when `group.settlementMode` changes: `useEffect(() => { setMode(group.settlementMode ?? "direct"); }, [group.settlementMode])`
    - _Bug_Condition: isBugCondition_Mode(group) where group.settlementMode = undefined_
    - _Expected_Behavior: mode is read from group.settlementMode; defaults to "direct" for legacy groups_
    - _Requirements: 2.1, 2.3_

  - [x] 7.2 Add admin-only gate on the mode toggle
    - Wrap both tab `<button>` elements: when `!isAdmin`, add `aria-disabled="true"`, `tabIndex={-1}`, and `onClick` no-op
    - Add a tooltip or inline note for non-admins explaining the toggle is admin-only
    - On admin tab click: call `setSettlementMode(group.id, newMode, user.uid)` then update local state optimistically
    - Import `setSettlementMode` from `@/lib/firebase/firestore`
    - _Bug_Condition: isBugCondition_Mode(group) where non-admin can toggle mode_
    - _Expected_Behavior: mode toggle is interactive only for admins; non-admins see read-only tabs_
    - _Requirements: 2.2_

  - [x] 7.3 Add Pending Actions panel for receivers
    - Compute `pendingForMe = settlements.filter(s => s.status === "pending" && s.toUid === user?.uid)`
    - Render a new section above the transfer list when `pendingForMe.length > 0`
    - Section heading: "Pending Actions" with a count badge
    - Render a `PendingSettlementCard` for each pending settlement
    - Wire `onAccept` to call `acceptSettlement(group.id, s.id, { uid: user.uid, name: user.name })`
    - Wire `onReject` to call `rejectSettlement(group.id, s.id, { uid: user.uid, name: user.name })`
    - Track per-card acting state with a `Map<string, boolean>` keyed by settlement id
    - Import `acceptSettlement`, `rejectSettlement` from `@/lib/firebase/firestore`
    - _Requirements: 2.8, 2.9, 2.10_

  - [x] 7.4 Add sender status view and cancel action in settlement history
    - In the settlement history list, replace the static `CheckCircle2` icon with a status-aware badge
    - For `status === "pending"`: show amber "Pending" badge + Cancel button (calls `cancelSettlement`) visible only to the sender (`s.fromUid === user?.uid`) or admins
    - For `status === "accepted"`: show green "Accepted" badge
    - For `status === "rejected"`: show red "Rejected" badge
    - For `status === "cancelled"`: show muted "Cancelled" badge
    - Import `cancelSettlement` from `@/lib/firebase/firestore`
    - _Requirements: 2.11, 3.8_

  - [x] 7.5 Update `createSettlement` call to match new `CreateSettlementInput` shape
    - Remove any fields now set server-side (`status`, `updatedAt`, `acceptedAt`, `acceptedBy`, `rejectedAt`) from the call site in `RecordSettlementDialog`
    - Update dialog copy: change "Mark as paid" button label to "Send payment request" to reflect the pending flow
    - _Requirements: 2.7_

- [x] 8. New `PendingSettlementCard` component — `components/settlements/pending-settlement-card.tsx`
  - Create new file at `components/settlements/pending-settlement-card.tsx`
  - Props interface: `{ settlement: SettlementDoc; group: GroupDoc; onAccept: () => void; onReject: () => void; isActing: boolean }`
  - Layout: card with amber left-border accent (`border-l-4 border-amber-500`) to signal pending state
  - Show sender avatar + name, arrow icon, amount in large mono font, and a note if present
  - Accept button: `variant="default"` (primary), label "Accept"
  - Reject button: `variant="outline"` with destructive text color, label "Reject"
  - Both buttons disabled and showing `Loader2` spinner when `isActing === true`
  - Add `aria-label` attributes for accessibility: "Accept payment from {senderName}", "Reject payment from {senderName}"
  - _Requirements: 2.8_

- [x] 9. Updated `SettlementTransferCard` with status badges — `components/settlements/settlement-transfer-card.tsx`
  - Add optional prop `status?: SettlementStatus` to the `Props` interface
  - Import `Badge` from `@/components/ui/badge` and `SettlementStatus` from `@/lib/firebase/types`
  - When `status` is provided, render a `Badge` below the amount with variant mapped from status:
    - `"pending"` → `variant="outline"` with amber text class
    - `"accepted"` → `variant="outline"` with success/green text class
    - `"rejected"` → `variant="destructive"`
    - `"cancelled"` → `variant="secondary"`
  - Badge label: capitalize the status string (e.g., "Pending", "Accepted")
  - _Requirements: 3.8_

- [x] 10. Activity feed icon mappings — `components/trips/activity-feed.tsx`
  - Import `CheckCircle2`, `XCircle`, `MinusCircle` from `lucide-react`
  - Add three entries to the `ICONS` record:
    - `"settlement.accepted": CheckCircle2`
    - `"settlement.rejected": XCircle`
    - `"settlement.cancelled": MinusCircle`
  - _Requirements: 2.13_

- [x] 11. Verify bug condition exploration tests now pass
  - **Property 1: Expected Behavior** - Settlement Status Filter and Mode Persistence
  - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
  - The tests from task 1 encode the expected behavior
  - When these tests pass, it confirms the expected behavior is satisfied
  - Run all four exploration tests from step 1 against the fixed code
  - **EXPECTED OUTCOME**: All four tests PASS (confirms both bugs are fixed)
  - _Requirements: 2.1, 2.2, 2.3, 2.7, 2.12, 2.14_

  - [x] 11.1 Verify preservation tests still pass
    - **Property 2: Preservation** - Accepted Settlements and Engine Wrapper Identity
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run all four preservation property tests from step 2 against the fixed code
    - **EXPECTED OUTCOME**: All tests PASS (confirms no regressions)
    - Confirm accepted settlements still shift balances identically, engine wrappers are identity functions, and legacy docs without `status` are treated as accepted
    - _Requirements: 3.1, 3.2, 3.5_

- [x] 12. Checkpoint — Ensure all tests pass
  - Run the full test suite
  - Verify: balance filter property tests pass (Property 2)
  - Verify: preservation property tests pass (Property 3, 4, 5)
  - Verify: unit tests for lifecycle functions pass (acceptSettlement, rejectSettlement, cancelSettlement, createSettlement duplicate check)
  - Verify: UI tests for mode toggle admin gate and pending actions panel pass
  - Ensure all tests pass; ask the user if questions arise

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "wave": 3, "tasks": ["4.1", "4.2", "4.3"] },
    { "wave": 4, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5"] },
    { "wave": 5, "tasks": ["6.1", "6.2", "8", "9", "10"] },
    { "wave": 6, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5"] },
    { "wave": 7, "tasks": ["11", "11.1"] },
    { "wave": 8, "tasks": ["12"] }
  ]
}
```

## Notes

- Tasks 1 and 2 (exploration and preservation tests) MUST be written and run against unfixed code before any implementation begins. Task 1 tests are expected to FAIL; task 2 tests are expected to PASS.
- Schema tasks (3.x) are prerequisites for all implementation tasks — complete them first to avoid TypeScript errors cascading through the codebase.
- The balance filter change in task 4.1 is a single-line fix but is the most critical correctness change — the `?? "accepted"` fallback is required for backward compatibility with existing Firestore data.
- `hooks/use-trip.ts` requires no changes — `watchSettlements` already returns all docs and the filter is applied inside `calculateBalances()`.
- Firestore security rules (task 6) can be deployed independently of the client-side changes but should be deployed before the new lifecycle functions go live.
- The `PendingSettlementCard` component (task 8) must be created before task 7.3 can import it.
