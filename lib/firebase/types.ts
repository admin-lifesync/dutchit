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

export type JoinPolicy = "open" | "admin-approval" | "member-approval";

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
  /**
   * Stable invite code for this trip. Generated at creation time and stays the
   * same forever (admins can rotate it via {@link rotateInviteCode}).
   * The same code lets anyone open `/invite/<code>` and request access.
   */
  inviteCode: string;
  /**
   * Who is allowed to join via the invite link:
   *  - `open`             — anyone with the link joins immediately
   *  - `admin-approval`   — only admins can approve incoming requests
   *  - `member-approval`  — any existing member can approve
   */
  joinPolicy: JoinPolicy;
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

/**
 * Public lookup doc for an invite code. Lives at `/invitations/{code}` and is
 * world-readable for any signed-in user — its only purpose is to map a short
 * URL-safe code back to a group + display the trip name & join policy on the
 * `/invite/<code>` landing page WITHOUT requiring read access on the group.
 *
 * One per group, lifecycle managed entirely by admins.
 */
export interface InvitationDoc {
  id: string;
  /** Stable code, also stored on `GroupDoc.inviteCode`. */
  code: string;
  groupId: string;
  groupName: string;
  joinPolicy: JoinPolicy;
  /** Admin uid that created or last rotated this code. */
  createdBy: string;
  createdAt: Timestamp;
}

export type JoinRequestStatus = "pending" | "approved" | "rejected";

/**
 * Lives at `/groups/{groupId}/joinRequests/{uid}`. One doc per requester.
 * Created by the would-be joiner; transitioned by an approver.
 */
export interface JoinRequestDoc {
  id: string;
  uid: string;
  name: string;
  email: string;
  photoURL: string | null;
  status: JoinRequestStatus;
  requestedAt: Timestamp;
  decidedAt: Timestamp | null;
  decidedBy: string | null;
}

export type ActivityType =
  | "group.created"
  | "member.joined"
  | "member.removed"
  | "member.requested"
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
