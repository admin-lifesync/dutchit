import {
  Timestamp,
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import type {
  ActivityLogDoc,
  ActivityType,
  ExpenseDoc,
  GroupDoc,
  GroupMemberSummary,
  InvitationDoc,
  JoinPolicy,
  JoinRequestDoc,
  SettlementDoc,
  UserDoc,
} from "@/lib/firebase/types";
import { generateId } from "@/lib/utils";
import { AppError } from "@/lib/errors/app-error";
import { ERROR_CODES } from "@/lib/errors/error-codes";
import { createLogger } from "@/lib/logger";

const dbLog = createLogger("firestore");

// ---- Collection refs ------------------------------------------------------

const col = {
  users: () => collection(getDb(), "users"),
  groups: () => collection(getDb(), "groups"),
  expenses: (groupId: string) =>
    collection(getDb(), "groups", groupId, "expenses"),
  settlements: (groupId: string) =>
    collection(getDb(), "groups", groupId, "settlements"),
  activity: (groupId: string) =>
    collection(getDb(), "groups", groupId, "activity"),
  joinRequests: (groupId: string) =>
    collection(getDb(), "groups", groupId, "joinRequests"),
  invitations: () => collection(getDb(), "invitations"),
};

// ---- Users ----------------------------------------------------------------

export async function upsertUser(user: {
  uid: string;
  name: string;
  email: string;
  photoURL: string | null;
}): Promise<void> {
  const ref = doc(col.users(), user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, {
      name: user.name,
      email: user.email,
      photoURL: user.photoURL,
    });
    return;
  }
  await setDoc(ref, {
    uid: user.uid,
    name: user.name,
    email: user.email,
    photoURL: user.photoURL,
    createdAt: serverTimestamp(),
  });
}

export async function getUser(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(col.users(), uid));
  return snap.exists() ? (snap.data() as UserDoc) : null;
}

// ---- Groups ---------------------------------------------------------------

export interface CreateGroupInput {
  name: string;
  description: string;
  imageURL: string | null;
  currency: string;
  creator: GroupMemberSummary;
}

export async function createGroup(input: CreateGroupInput): Promise<string> {
  const ref = doc(col.groups());
  const inviteCode = generateId(10);
  const member: GroupMemberSummary = { ...input.creator, role: "admin" };
  const data: Omit<GroupDoc, "id"> = {
    name: input.name.trim(),
    description: input.description.trim(),
    imageURL: input.imageURL,
    currency: input.currency,
    createdBy: input.creator.uid,
    createdAt: serverTimestamp() as unknown as Timestamp,
    updatedAt: serverTimestamp() as unknown as Timestamp,
    memberIds: [input.creator.uid],
    adminIds: [input.creator.uid],
    members: [member],
    expenseCount: 0,
    totalSpent: 0,
    inviteCode,
    joinPolicy: "open",
  };
  // The group must exist before we can create the invitations doc — the
  // invitations rule reads `groups/{id}.adminIds` to authorize the write.
  // We accept a brief window where the link doesn't exist; the trip page
  // calls `ensureInviteCode()` if it ever finds a missing code.
  await setDoc(ref, data);
  try {
    await setDoc(doc(col.invitations(), inviteCode), {
      code: inviteCode,
      groupId: ref.id,
      groupName: data.name,
      joinPolicy: data.joinPolicy,
      createdBy: input.creator.uid,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    // Non-fatal: the trip still works without an invite doc, an admin can
    // regenerate it via the share dialog. Log so we know if it ever happens.
    dbLog.warn("Failed to seed invitations doc on createGroup", {
      groupId: ref.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
  await logActivitySafe(ref.id, {
    type: "group.created",
    actorUid: input.creator.uid,
    actorName: input.creator.name,
    message: `${input.creator.name} created the group`,
    meta: {},
  });
  return ref.id;
}

export function watchUserGroups(
  uid: string,
  cb: (groups: GroupDoc[]) => void
): Unsubscribe {
  const q = query(
    col.groups(),
    where("memberIds", "array-contains", uid),
    orderBy("updatedAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GroupDoc, "id">) })));
    },
    (err) => {
      dbLog.warn("watchUserGroups error", { uid, code: err.code, message: err.message });
      cb([]);
    }
  );
}

export function watchGroup(
  groupId: string,
  cb: (group: GroupDoc | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(col.groups(), groupId),
    (snap) => {
      cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<GroupDoc, "id">) }) : null);
    },
    (err) => {
      dbLog.warn("watchGroup error", { groupId, code: err.code, message: err.message });
      cb(null);
    }
  );
}

export async function deleteGroup(groupId: string): Promise<void> {
  // Remove subcollections then the group doc. This is fine for trip-sized
  // groups (typically < a few hundred docs).
  const db = getDb();
  const subcollections = [
    "expenses",
    "settlements",
    "activity",
    "joinRequests",
  ] as const;
  for (const sub of subcollections) {
    const snap = await getDocs(collection(db, "groups", groupId, sub));
    const chunks: typeof snap.docs[] = [];
    const CHUNK = 400;
    for (let i = 0; i < snap.docs.length; i += CHUNK) {
      chunks.push(snap.docs.slice(i, i + CHUNK));
    }
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  // Drop the public invite lookup(s) for this group so the link goes dead.
  const invSnap = await getDocs(
    query(col.invitations(), where("groupId", "==", groupId))
  );
  if (invSnap.docs.length) {
    const batch = writeBatch(db);
    invSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(doc(col.groups(), groupId));
}

export async function removeMember(
  groupId: string,
  uid: string,
  actor: { uid: string; name: string }
): Promise<void> {
  const ref = doc(col.groups(), groupId);
  await runTransaction(getDb(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new AppError(ERROR_CODES.GRP_NOT_FOUND, { context: { groupId } });
    }
    const group = snap.data() as Omit<GroupDoc, "id">;
    const member = group.members.find((m) => m.uid === uid);
    if (!member) return;
    const nextMembers = group.members.filter((m) => m.uid !== uid);
    tx.update(ref, {
      members: nextMembers,
      memberIds: arrayRemove(uid),
      adminIds: arrayRemove(uid),
      updatedAt: serverTimestamp(),
    });
  });
  await logActivitySafe(groupId, {
    type: "member.removed",
    actorUid: actor.uid,
    actorName: actor.name,
    message: `${actor.name} removed a member`,
    meta: { removedUid: uid },
  });
}

export async function leaveGroup(
  groupId: string,
  user: { uid: string; name: string }
): Promise<void> {
  await removeMember(groupId, user.uid, user);
}

// ---- Expenses -------------------------------------------------------------

export interface CreateExpenseInput
  extends Omit<ExpenseDoc, "id" | "createdAt" | "updatedAt"> {}

export async function createExpense(
  input: CreateExpenseInput,
  actorName: string
): Promise<string> {
  const db = getDb();
  const ref = doc(col.expenses(input.groupId));
  await runTransaction(db, async (tx) => {
    const groupRef = doc(col.groups(), input.groupId);
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists()) {
      throw new AppError(ERROR_CODES.GRP_NOT_FOUND, {
        context: { groupId: input.groupId },
      });
    }
    tx.set(ref, {
      ...input,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.update(groupRef, {
      expenseCount: increment(1),
      totalSpent: increment(input.amount),
      updatedAt: serverTimestamp(),
    });
  });
  await logActivitySafe(input.groupId, {
    type: "expense.created",
    actorUid: input.createdBy,
    actorName,
    message: `${actorName} added "${input.title}"`,
    meta: { amount: input.amount, expenseId: ref.id },
  });
  return ref.id;
}

export async function updateExpense(
  groupId: string,
  expenseId: string,
  patch: Partial<Omit<ExpenseDoc, "id" | "groupId" | "createdAt" | "createdBy">>,
  actor: { uid: string; name: string }
): Promise<void> {
  const db = getDb();
  const ref = doc(col.expenses(groupId), expenseId);
  await runTransaction(db, async (tx) => {
    const groupRef = doc(col.groups(), groupId);
    const [snap, groupSnap] = await Promise.all([tx.get(ref), tx.get(groupRef)]);
    if (!snap.exists()) {
      throw new AppError(ERROR_CODES.EXP_NOT_FOUND, {
        context: { groupId, expenseId },
      });
    }
    if (!groupSnap.exists()) {
      throw new AppError(ERROR_CODES.GRP_NOT_FOUND, { context: { groupId } });
    }
    const old = snap.data() as ExpenseDoc;
    tx.update(ref, { ...patch, updatedAt: serverTimestamp() });
    if (patch.amount !== undefined && patch.amount !== old.amount) {
      tx.update(groupRef, {
        totalSpent: increment(patch.amount - old.amount),
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.update(groupRef, { updatedAt: serverTimestamp() });
    }
  });
  await logActivitySafe(groupId, {
    type: "expense.updated",
    actorUid: actor.uid,
    actorName: actor.name,
    message: `${actor.name} edited an expense`,
    meta: { expenseId },
  });
}

export async function deleteExpense(
  groupId: string,
  expenseId: string,
  actor: { uid: string; name: string }
): Promise<void> {
  const db = getDb();
  const ref = doc(col.expenses(groupId), expenseId);
  await runTransaction(db, async (tx) => {
    const groupRef = doc(col.groups(), groupId);
    const [snap, groupSnap] = await Promise.all([tx.get(ref), tx.get(groupRef)]);
    if (!snap.exists()) return;
    if (!groupSnap.exists()) {
      throw new AppError(ERROR_CODES.GRP_NOT_FOUND, { context: { groupId } });
    }
    const old = snap.data() as ExpenseDoc;
    tx.delete(ref);
    tx.update(groupRef, {
      expenseCount: increment(-1),
      totalSpent: increment(-old.amount),
      updatedAt: serverTimestamp(),
    });
  });
  await logActivitySafe(groupId, {
    type: "expense.deleted",
    actorUid: actor.uid,
    actorName: actor.name,
    message: `${actor.name} removed an expense`,
    meta: { expenseId },
  });
}

export function watchExpenses(
  groupId: string,
  cb: (expenses: ExpenseDoc[]) => void
): Unsubscribe {
  const q = query(col.expenses(groupId), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      cb(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExpenseDoc, "id">) }))
      );
    },
    (err) => {
      dbLog.warn("watchExpenses error", { groupId, code: err.code, message: err.message });
      cb([]);
    }
  );
}

// ---- Settlements ----------------------------------------------------------

export interface CreateSettlementInput
  extends Omit<SettlementDoc, "id" | "createdAt"> {}

export async function createSettlement(
  input: CreateSettlementInput,
  actorName: string
): Promise<string> {
  const ref = doc(col.settlements(input.groupId));
  await setDoc(ref, { ...input, createdAt: serverTimestamp() });
  await updateDoc(doc(col.groups(), input.groupId), {
    updatedAt: serverTimestamp(),
  });
  await logActivitySafe(input.groupId, {
    type: "settlement.created",
    actorUid: input.createdBy,
    actorName,
    message: `${actorName} recorded a settlement`,
    meta: {
      from: input.fromUid,
      to: input.toUid,
      amount: input.amount,
    },
  });
  return ref.id;
}

export function watchSettlements(
  groupId: string,
  cb: (settlements: SettlementDoc[]) => void
): Unsubscribe {
  const q = query(col.settlements(groupId), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      cb(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SettlementDoc, "id">) }))
      );
    },
    (err) => {
      dbLog.warn("watchSettlements error", { groupId, code: err.code, message: err.message });
      cb([]);
    }
  );
}

// ---- Invitations ----------------------------------------------------------

/**
 * Public-readable invite metadata. Returned for non-members so they can see
 * the trip name on the `/invite/<code>` page without us granting them read
 * access on the group itself.
 */
export interface PublicInvite {
  code: string;
  groupId: string;
  groupName: string;
  joinPolicy: JoinPolicy;
}

export async function getPublicInvite(code: string): Promise<PublicInvite | null> {
  const snap = await getDoc(doc(col.invitations(), code));
  if (!snap.exists()) return null;
  const data = snap.data() as Omit<InvitationDoc, "id">;
  return {
    code: data.code,
    groupId: data.groupId,
    groupName: data.groupName,
    // Legacy invites (pre-redesign) didn't carry joinPolicy; default to open
    // so they keep working exactly like they did before.
    joinPolicy: (data.joinPolicy as JoinPolicy | undefined) ?? "open",
  };
}

/**
 * Ensures a group has an `inviteCode` + matching `invitations/{code}` doc.
 * Safe to call repeatedly. Required to bring legacy groups (created before
 * the per-trip-link redesign) up to date.
 *
 * Admin-only.
 */
export async function ensureInviteCode(group: GroupDoc): Promise<string> {
  if (group.inviteCode) return group.inviteCode;
  const code = generateId(10);
  const batch = writeBatch(getDb());
  batch.update(doc(col.groups(), group.id), {
    inviteCode: code,
    joinPolicy: group.joinPolicy ?? "open",
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(col.invitations(), code), {
    code,
    groupId: group.id,
    groupName: group.name,
    joinPolicy: group.joinPolicy ?? "open",
    createdBy: group.createdBy,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return code;
}

/** Admin-only. Rotates the invite code, killing any previously-shared link. */
export async function rotateInviteCode(group: GroupDoc): Promise<string> {
  const next = generateId(10);
  const batch = writeBatch(getDb());
  // Best-effort cleanup of the old code (admins are allowed to delete).
  if (group.inviteCode) {
    batch.delete(doc(col.invitations(), group.inviteCode));
  }
  batch.update(doc(col.groups(), group.id), {
    inviteCode: next,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(col.invitations(), next), {
    code: next,
    groupId: group.id,
    groupName: group.name,
    joinPolicy: group.joinPolicy ?? "open",
    createdBy: group.createdBy,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return next;
}

/** Admin-only. Updates how new members are admitted. */
export async function setJoinPolicy(
  group: GroupDoc,
  policy: JoinPolicy
): Promise<void> {
  const batch = writeBatch(getDb());
  batch.update(doc(col.groups(), group.id), {
    joinPolicy: policy,
    updatedAt: serverTimestamp(),
  });
  // Keep the public invitations doc in sync so the landing page shows the
  // right CTA without an extra read.
  if (group.inviteCode) {
    batch.update(doc(col.invitations(), group.inviteCode), {
      joinPolicy: policy,
    });
  }
  await batch.commit();
}

/**
 * Self-add for `open` groups. Uses arrayUnion so the security rules can
 * validate the result without us reading the group first (we're not a member
 * yet, so we have no read access).
 */
export async function joinOpenGroup(
  invite: PublicInvite,
  user: GroupMemberSummary
): Promise<{ alreadyMember: boolean }> {
  if (invite.joinPolicy !== "open") {
    throw new AppError(ERROR_CODES.INV_FORBIDDEN, {
      context: { reason: "policy-mismatch", policy: invite.joinPolicy },
    });
  }
  const groupRef = doc(col.groups(), invite.groupId);
  const newMember: GroupMemberSummary = { ...user, role: "member" };
  try {
    await updateDoc(groupRef, {
      memberIds: arrayUnion(user.uid),
      members: arrayUnion(newMember),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // If the user is already a member, the rule branch (4) refuses the write
    // (because their uid is already in memberIds). Treat that as "already in".
    const code = (err as { code?: string }).code;
    if (code === "permission-denied") {
      return { alreadyMember: true };
    }
    throw err;
  }
  await logActivitySafe(invite.groupId, {
    type: "member.joined",
    actorUid: user.uid,
    actorName: user.name,
    message: `${user.name} joined the group`,
    meta: {},
  });
  return { alreadyMember: false };
}

/**
 * For `admin-approval` / `member-approval` policies. Creates (or upserts)
 * a join-request doc. The requester polls their own doc; once an approver
 * flips it to `approved`, the requester completes the join via
 * {@link finalizeApprovedJoin}.
 */
export async function requestToJoin(
  invite: PublicInvite,
  user: GroupMemberSummary
): Promise<void> {
  if (invite.joinPolicy === "open") {
    throw new AppError(ERROR_CODES.INV_FORBIDDEN, {
      context: { reason: "policy-open" },
    });
  }
  await setDoc(
    doc(col.joinRequests(invite.groupId), user.uid),
    {
      uid: user.uid,
      name: user.name,
      email: user.email,
      photoURL: user.photoURL,
      status: "pending",
      requestedAt: serverTimestamp(),
      decidedAt: null,
      decidedBy: null,
    },
    { merge: false }
  );
}

/** The requester removes their own pending request. */
export async function cancelJoinRequest(
  groupId: string,
  uid: string
): Promise<void> {
  await deleteDoc(doc(col.joinRequests(groupId), uid));
}

/**
 * Approver flow. The approver flips the join request to `approved` so the
 * requester can finalise. Approver permissions are enforced server-side by
 * the rule on `/groups/{gid}/joinRequests/{uid}` based on `joinPolicy`.
 */
export async function approveJoinRequest(
  groupId: string,
  uid: string,
  approver: { uid: string; name: string }
): Promise<void> {
  await updateDoc(doc(col.joinRequests(groupId), uid), {
    status: "approved",
    decidedAt: serverTimestamp(),
    decidedBy: approver.uid,
  });
  await logActivitySafe(groupId, {
    type: "member.requested",
    actorUid: approver.uid,
    actorName: approver.name,
    message: `${approver.name} approved a join request`,
    meta: { requesterUid: uid },
  });
}

export async function rejectJoinRequest(
  groupId: string,
  uid: string,
  approver: { uid: string; name: string }
): Promise<void> {
  await updateDoc(doc(col.joinRequests(groupId), uid), {
    status: "rejected",
    decidedAt: serverTimestamp(),
    decidedBy: approver.uid,
  });
  await logActivitySafe(groupId, {
    type: "member.requested",
    actorUid: approver.uid,
    actorName: approver.name,
    message: `${approver.name} declined a join request`,
    meta: { requesterUid: uid },
  });
}

/**
 * Self-add after approval. Same security model as {@link joinOpenGroup} —
 * the rule grants the write because the requester has an `approved`
 * joinRequests doc.
 */
export async function finalizeApprovedJoin(
  groupId: string,
  user: GroupMemberSummary
): Promise<void> {
  const groupRef = doc(col.groups(), groupId);
  const newMember: GroupMemberSummary = { ...user, role: "member" };
  try {
    await updateDoc(groupRef, {
      memberIds: arrayUnion(user.uid),
      members: arrayUnion(newMember),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "permission-denied") {
      // Already a member — fine, no-op.
      return;
    }
    throw err;
  }
  // Clean up the request once we're in.
  try {
    await deleteDoc(doc(col.joinRequests(groupId), user.uid));
  } catch (err) {
    dbLog.warn("Failed to clean up joinRequest after join", {
      groupId,
      uid: user.uid,
      message: err instanceof Error ? err.message : String(err),
    });
  }
  await logActivitySafe(groupId, {
    type: "member.joined",
    actorUid: user.uid,
    actorName: user.name,
    message: `${user.name} joined the group`,
    meta: {},
  });
}

export function watchJoinRequests(
  groupId: string,
  cb: (requests: JoinRequestDoc[]) => void
): Unsubscribe {
  const q = query(col.joinRequests(groupId), orderBy("requestedAt", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      cb(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<JoinRequestDoc, "id">),
        }))
      );
    },
    (err) => {
      dbLog.warn("watchJoinRequests error", {
        groupId,
        code: err.code,
        message: err.message,
      });
      cb([]);
    }
  );
}

export function watchMyJoinRequest(
  groupId: string,
  uid: string,
  cb: (request: JoinRequestDoc | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(col.joinRequests(groupId), uid),
    (snap) => {
      cb(
        snap.exists()
          ? ({ id: snap.id, ...(snap.data() as Omit<JoinRequestDoc, "id">) })
          : null
      );
    },
    (err) => {
      dbLog.warn("watchMyJoinRequest error", {
        groupId,
        uid,
        code: err.code,
        message: err.message,
      });
      cb(null);
    }
  );
}

// ---- Activity feed --------------------------------------------------------

export async function logActivity(
  groupId: string,
  entry: {
    type: ActivityType;
    actorUid: string;
    actorName: string;
    message: string;
    meta: Record<string, string | number | null>;
  }
): Promise<void> {
  await addDoc(col.activity(groupId), {
    ...entry,
    groupId,
    createdAt: serverTimestamp(),
  });
}

export function watchActivity(
  groupId: string,
  max: number,
  cb: (entries: ActivityLogDoc[]) => void
): Unsubscribe {
  const q = query(
    col.activity(groupId),
    orderBy("createdAt", "desc"),
    limit(max)
  );
  return onSnapshot(
    q,
    (snap) => {
      cb(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ActivityLogDoc, "id">),
        }))
      );
    },
    (err) => {
      dbLog.warn("watchActivity error", { groupId, code: err.code, message: err.message });
      cb([]);
    }
  );
}

// Wrap logActivity errors so a failed activity write never blocks the parent
// action (e.g. expense create succeeds even if activity insert fails).
export async function logActivitySafe(
  ...args: Parameters<typeof logActivity>
): Promise<void> {
  try {
    await logActivity(...args);
  } catch (err) {
    dbLog.warn("activity log failed", {
      groupId: args[0],
      type: args[1].type,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
