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
  };
  await setDoc(ref, data);
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
  // Remove subcollections (expenses, settlements, activity) then the group doc.
  // This is fine for trip-sized groups (typically < a few hundred docs).
  const db = getDb();
  const subcollections = ["expenses", "settlements", "activity"] as const;
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
  // Revoke pending invitations.
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

export async function createInvitation(opts: {
  groupId: string;
  groupName: string;
  invitedBy: string;
  email?: string | null;
}): Promise<InvitationDoc> {
  const code = generateId(10);
  const ref = doc(col.invitations(), code);
  const data: Omit<InvitationDoc, "id"> = {
    groupId: opts.groupId,
    groupName: opts.groupName,
    code,
    email: opts.email ?? null,
    invitedBy: opts.invitedBy,
    status: "pending",
    createdAt: serverTimestamp() as unknown as Timestamp,
    acceptedAt: null,
    acceptedBy: null,
  };
  await setDoc(ref, data);
  return { id: ref.id, ...data };
}

export async function getInvitation(code: string): Promise<InvitationDoc | null> {
  const snap = await getDoc(doc(col.invitations(), code));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<InvitationDoc, "id">) }) : null;
}

export async function acceptInvitation(
  code: string,
  user: GroupMemberSummary
): Promise<{ groupId: string; alreadyMember: boolean }> {
  const db = getDb();
  const inviteRef = doc(col.invitations(), code);

  // We deliberately don't `tx.get()` the group document here:
  // the security rules only allow group reads for existing members, and the
  // whole point of this transaction is that the caller is *not* a member yet.
  // Instead we use `arrayUnion` so the rules engine can validate the resulting
  // memberIds / members arrays server-side without us having to read them.
  const result = await runTransaction(db, async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists()) {
      throw new AppError(ERROR_CODES.INV_NOT_FOUND, { context: { code } });
    }

    const invite = inviteSnap.data() as Omit<InvitationDoc, "id">;
    if (invite.status === "revoked") {
      throw new AppError(ERROR_CODES.INV_REVOKED, { context: { code } });
    }
    if (invite.status === "accepted") {
      // Someone (possibly this user) already accepted it — just route them in.
      dbLog.info("Invite already accepted, routing to group", {
        code,
        groupId: invite.groupId,
      });
      return { groupId: invite.groupId, alreadyMember: true };
    }

    const groupRef = doc(col.groups(), invite.groupId);
    const newMember: GroupMemberSummary = { ...user, role: "member" };

    tx.update(groupRef, {
      memberIds: arrayUnion(user.uid),
      members: arrayUnion(newMember),
      updatedAt: serverTimestamp(),
    });
    tx.update(inviteRef, {
      status: "accepted",
      acceptedAt: serverTimestamp(),
      acceptedBy: user.uid,
    });
    return { groupId: invite.groupId, alreadyMember: false };
  });

  if (!result.alreadyMember) {
    await logActivitySafe(result.groupId, {
      type: "member.joined",
      actorUid: user.uid,
      actorName: user.name,
      message: `${user.name} joined the group`,
      meta: {},
    });
  }
  return result;
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
