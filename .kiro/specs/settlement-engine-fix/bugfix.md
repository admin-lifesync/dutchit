# Bugfix Requirements Document

## Introduction

Dutch.it's settlement engine has two critical bugs that undermine the app's core promise of being mathematically correct and trustworthy.

**Bug 1 — Settlement mode indistinguishability:** The "Direct" and "Minimized" settlement modes produce functionally identical output. Direct mode currently uses `grossDirectedOwingFromExpenses()` (raw expense ledger) while Minimized uses `simplifyDebts()` (net balance optimization), but the UI allows any user to switch modes and record settlements in either mode without restriction. More critically, the `settlementMode` is not persisted on the group document — it is purely local UI state — so different users see different modes simultaneously, and the mode resets on every page load. There is no admin-only gate on mode switching.

**Bug 2 — No approval-based settlement flow:** Settlements are recorded unilaterally by the sender clicking "Mark paid." The receiver has no way to confirm or dispute the payment. A `SettlementDoc` has no `status` field, so once written it immediately and irrevocably shifts everyone's balances — even if the receiver never received the money. There is no pending/accepted/rejected lifecycle, no audit trail of approval actions, and no protection against duplicate or fraudulent settlement claims.

---

## Bug Analysis

### Current Behavior (Defect)

**Settlement Mode Bug:**

1.1 WHEN a non-admin user switches the settlement mode from "Direct" to "Minimized" THEN the system allows the switch and shows minimized transfers, giving non-admins unauthorized control over the group's settlement strategy

1.2 WHEN a user navigates away from the trip page and returns THEN the system resets the settlement mode to "Direct" (local state only), so the group has no persistent, shared settlement mode

1.3 WHEN two members view the settlement panel simultaneously THEN the system shows each member whichever mode they last selected locally, so members see inconsistent settlement plans with no shared source of truth

1.4 WHEN Direct mode and Minimized mode are both active for a group with cross-debts (e.g. A paid for B, B paid for C) THEN the system produces different transfer lists but both are presented as equally valid settlement plans with no indication that only one is authoritative

**Approval-Based Settlement Bug:**

1.5 WHEN a sender clicks "Mark paid" on a settlement transfer THEN the system immediately writes a `SettlementDoc` and updates all member balances without any confirmation from the receiver

1.6 WHEN a settlement is recorded THEN the system has no `status` field on `SettlementDoc`, so there is no way to distinguish a confirmed payment from an unconfirmed claim

1.7 WHEN a receiver disputes a settlement that was recorded without their knowledge THEN the system provides no mechanism to reject or reverse it — the balance shift is permanent

1.8 WHEN a sender submits a duplicate settlement request for the same debt THEN the system writes a second `SettlementDoc` and double-counts the payment in balance calculations

1.9 WHEN a settlement is in any state THEN the system applies it to balance calculations regardless of whether the receiver has confirmed receipt of the money

### Expected Behavior (Correct)

**Settlement Mode Fix:**

2.1 WHEN a group admin switches the settlement mode THEN the system SHALL persist `settlementMode: "direct" | "minimized"` on the `GroupDoc` in Firestore so all members see the same mode

2.2 WHEN a non-admin member views the settlement panel THEN the system SHALL display the current settlement mode as read-only and SHALL NOT allow them to switch modes

2.3 WHEN any member loads the trip page THEN the system SHALL read `settlementMode` from the group document and display the correct mode without resetting to a default

2.4 WHEN Direct mode is active THEN the system SHALL use `calculateDirectSettlements()` which preserves original expense relationships — each non-payer owes the payer their share on that specific expense, with no cross-group debt merging

2.5 WHEN Minimized mode is active THEN the system SHALL use `calculateMinimizedSettlements()` which computes global net balances across all members and reduces total transactions using greedy creditor/debtor balancing

2.6 WHEN Direct mode produces transfers (e.g. B owes A ₹1000, C owes B ₹500) THEN the system SHALL NOT merge these into cross-party transfers (e.g. SHALL NOT produce C owes A ₹500)

**Approval-Based Settlement Fix:**

2.7 WHEN a sender initiates a settlement payment THEN the system SHALL create a `SettlementDoc` with `status: "pending"` and SHALL NOT update any member balances at this point

2.8 WHEN a receiver views their pending settlement requests THEN the system SHALL display a settlement card with Accept and Reject actions

2.9 WHEN a receiver accepts a settlement THEN the system SHALL update the `SettlementDoc` to `status: "accepted"`, record `acceptedAt` and `acceptedBy`, and ONLY THEN apply the balance adjustment

2.10 WHEN a receiver rejects a settlement THEN the system SHALL update the `SettlementDoc` to `status: "rejected"`, record `rejectedAt`, and SHALL NOT apply any balance adjustment

2.11 WHEN a sender cancels a pending settlement before the receiver acts THEN the system SHALL update the `SettlementDoc` to `status: "cancelled"` and SHALL NOT apply any balance adjustment

2.12 WHEN balance calculations are performed THEN the system SHALL ONLY include settlements with `status: "accepted"` in the calculation, excluding `pending`, `rejected`, and `cancelled` settlements

2.13 WHEN a settlement action occurs (sent, accepted, rejected, cancelled) THEN the system SHALL write an activity log entry to the group's activity feed

2.14 WHEN a duplicate settlement request is submitted for a debt that already has a `pending` settlement THEN the system SHALL prevent creation of the duplicate and inform the sender

### Unchanged Behavior (Regression Prevention)

3.1 WHEN expenses are created, edited, or deleted THEN the system SHALL CONTINUE TO recalculate member balances correctly based on `paidBy` and `splitValues`

3.2 WHEN a settlement is accepted THEN the system SHALL CONTINUE TO shift the payer's net balance upward and the receiver's net balance downward by the settled amount

3.3 WHEN the group has no unsettled debts THEN the system SHALL CONTINUE TO display the "All settled up" empty state in the settlement panel

3.4 WHEN a group admin views the settlement panel THEN the system SHALL CONTINUE TO show the mode toggle (now persisted and admin-controlled)

3.5 WHEN Minimized mode is active THEN the system SHALL CONTINUE TO use the greedy debt-simplification algorithm (largest creditor vs largest debtor) producing at most N-1 transfers

3.6 WHEN a member's net balance is positive THEN the system SHALL CONTINUE TO display them as a creditor ("Should receive") in the balances section

3.7 WHEN a member's net balance is negative THEN the system SHALL CONTINUE TO display them as a debtor ("Should pay in") in the balances section

3.8 WHEN settlement history is viewed THEN the system SHALL CONTINUE TO show all recorded settlements with actor names, amounts, timestamps, and notes — now also showing status badges

3.9 WHEN a user is not involved in any settlement transfer THEN the system SHALL CONTINUE TO show all transfers in the panel (not filtered to only the current user)

3.10 WHEN the group currency is set THEN the system SHALL CONTINUE TO format all settlement amounts using that currency

---

## Bug Condition Pseudocode

### Bug 1: Settlement Mode Indistinguishability

**Bug Condition Function:**
```pascal
FUNCTION isBugCondition_Mode(group: GroupDoc, viewerUid: string)
  INPUT: group document, viewer's uid
  OUTPUT: boolean

  // Bug triggers when mode is not persisted on the group
  RETURN group.settlementMode = undefined
      OR (viewer is non-admin AND mode toggle is interactive)
END FUNCTION
```

**Property: Fix Checking — Mode Persistence**
```pascal
FOR ALL group WHERE isBugCondition_Mode(group, viewerUid) DO
  result ← loadSettlementPanel'(group, viewerUid)
  ASSERT result.mode = group.settlementMode          // reads from Firestore
  ASSERT result.modeToggleEnabled = isAdmin(viewerUid, group)
END FOR
```

**Property: Preservation Checking**
```pascal
FOR ALL group WHERE NOT isBugCondition_Mode(group, viewerUid) DO
  ASSERT loadSettlementPanel(group) = loadSettlementPanel'(group)
END FOR
```

---

### Bug 2: Unilateral Settlement Recording

**Bug Condition Function:**
```pascal
FUNCTION isBugCondition_Settlement(settlement: SettlementDoc)
  INPUT: a settlement document
  OUTPUT: boolean

  // Bug triggers when settlement has no status (old schema) or is not accepted
  RETURN settlement.status = undefined
      OR settlement.status ≠ "accepted"
END FUNCTION
```

**Property: Fix Checking — Balance Isolation**
```pascal
FOR ALL settlement WHERE isBugCondition_Settlement(settlement) DO
  balances ← calculateBalances'(members, expenses, allSettlements)
  ASSERT settlement NOT IN balances.appliedSettlements
  ASSERT balances = calculateBalances'(members, expenses, acceptedSettlementsOnly)
END FOR
```

**Property: Preservation Checking**
```pascal
FOR ALL settlement WHERE settlement.status = "accepted" DO
  ASSERT calculateBalances(members, expenses, [settlement])
       = calculateBalances'(members, expenses, [settlement])
END FOR
```
