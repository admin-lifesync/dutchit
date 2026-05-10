import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "member";

export type SplitType = "equal" | "exact" | "percent" | "share" | "personal";

export type ExpenseCategory =
  | "food"
  | "fuel"
  | "hotel"
  | "shopping"
  | "transport"
  | "alcohol"
  | "misc";

export interface UserDoc {
  uid: string;
  name: string;
  email: string;
  photoURL: string | null;
  createdAt: Timestamp;
}

export interface GroupMemberSummary {
  uid: string;
  name: string;
  email: string;
  photoURL: string | null;
  role: Role;
}

export interface GroupDoc {
  id: string;
  name: string;
  description: string;
  imageURL: string | null;
  currency: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** Denormalized array of member uids for queries + security rules. */
  memberIds: string[];
  /** Denormalized array of admin uids for fast role checks in security rules. */
  adminIds: string[];
  /** Denormalized member info for fast list rendering. */
  members: GroupMemberSummary[];
  /** Denormalized expense count for dashboard cards. */
  expenseCount: number;
  /** Denormalized total spent (in group currency). */
  totalSpent: number;
}

export interface SplitValue {
  uid: string;
  /** Interpretation depends on split type:
   *  - equal: 1 if included, 0 if not (informational)
   *  - exact: exact amount in currency units
   *  - percent: percent (0..100)
   *  - share: number of shares (e.g. 1, 2, 3)
   *  - personal: full amount (only one entry)
   */
  value: number;
  /** Resolved owed amount in currency units (computed at write time). */
  owed: number;
}

export interface ExpenseDoc {
  id: string;
  groupId: string;
  title: string;
  amount: number;
  currency: string;
  paidBy: string;
  participants: string[];
  splitType: SplitType;
  splitValues: SplitValue[];
  category: ExpenseCategory;
  notes: string;
  receiptURL: string | null;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SettlementDoc {
  id: string;
  groupId: string;
  fromUid: string;
  toUid: string;
  amount: number;
  currency: string;
  note: string;
  createdAt: Timestamp;
  createdBy: string;
}

export type InvitationStatus = "pending" | "accepted" | "revoked";

export interface InvitationDoc {
  id: string;
  groupId: string;
  groupName: string;
  /** Random short code used in the invite URL. */
  code: string;
  /** Optional: invite targeted to a specific email. */
  email: string | null;
  invitedBy: string;
  status: InvitationStatus;
  createdAt: Timestamp;
  acceptedAt: Timestamp | null;
  acceptedBy: string | null;
}

export type ActivityType =
  | "group.created"
  | "member.joined"
  | "member.removed"
  | "expense.created"
  | "expense.updated"
  | "expense.deleted"
  | "settlement.created";

export interface ActivityLogDoc {
  id: string;
  groupId: string;
  type: ActivityType;
  actorUid: string;
  actorName: string;
  /** Free-form, human-readable summary used by the activity feed. */
  message: string;
  /** Light-weight payload for richer rendering if needed. */
  meta: Record<string, string | number | null>;
  createdAt: Timestamp;
}
