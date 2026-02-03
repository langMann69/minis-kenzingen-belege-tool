import {
  Timestamp,
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type ReceiptData = Record<string, any>;

function parseReceiptDateToTimestamp(receiptDate: any): Timestamp | null {
  // erwartet bei euch: "YYYY-MM-DD" (string)
  if (typeof receiptDate !== "string" || !receiptDate) return null;

  // wichtig: "T00:00:00" anhängen, damit keine TZ-Shift-Probleme entstehen
  const d = new Date(`${receiptDate}T00:00:00`);
  if (isNaN(d.getTime())) return null;

  return Timestamp.fromDate(d);
}

function makeRevisionPayload(params: {
  action: "create" | "update" | "delete";
  receiptId: string;
  editedByUserId: string;
  before: ReceiptData | null;
  after: ReceiptData | null;
  patch?: ReceiptData | null;
}) {
  return {
    action: params.action,
    receiptId: params.receiptId,
    editedByUserId: params.editedByUserId,
    before: params.before,
    after: params.after,
    patch: params.patch ?? null,
    createdAt: serverTimestamp(),
  };
}

/**
 * UPDATE mit Revision (atomar in Transaction)
 * - schreibt receipts/{id} Update
 * - schreibt receipts/{id}/revisions/{revId}
 * - pflegt receiptDateTs automatisch, falls receiptDate im Patch enthalten ist
 */
export async function updateReceiptWithRevision(params: {
  receiptId: string;
  editedByUserId: string;
  patch: ReceiptData; // nur die Felder, die du ändern willst
}) {
  const { receiptId, editedByUserId } = params;
  const patch = { ...(params.patch ?? {}) };

  const receiptRef = doc(db, "receipts", receiptId);
  const revRef = doc(collection(receiptRef, "revisions")); // auto-id

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(receiptRef);
    if (!snap.exists()) throw new Error("Beleg existiert nicht.");

    const before = snap.data() as ReceiptData;

    // receiptDateTs pflegen, wenn receiptDate geändert wird
    if (patch.receiptDate !== undefined) {
      const ts = parseReceiptDateToTimestamp(patch.receiptDate);
      if (ts) patch.receiptDateTs = ts;
      else patch.receiptDateTs = null;
    }

    const after = { ...before, ...patch };

    tx.update(receiptRef, {
      ...patch,
      updatedAt: serverTimestamp(),
      updatedByUserId: editedByUserId,
    });

    tx.set(
      revRef,
      makeRevisionPayload({
        action: "update",
        receiptId,
        editedByUserId,
        before,
        after,
        patch,
      })
    );
  });
}

/**
 * SOFT DELETE mit Revision (atomar)
 * - setzt deletedAt + deletedByUserId
 * - schreibt Revision action="delete"
 */
export async function softDeleteReceiptWithRevision(params: {
  receiptId: string;
  editedByUserId: string;
}) {
  const { receiptId, editedByUserId } = params;

  const receiptRef = doc(db, "receipts", receiptId);
  const revRef = doc(collection(receiptRef, "revisions"));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(receiptRef);
    if (!snap.exists()) throw new Error("Beleg existiert nicht.");

    const before = snap.data() as ReceiptData;

    // schon gelöscht? dann nix machen (idempotent)
    if (before.deletedAt) return;

    const patch = {
      deletedAt: serverTimestamp(),
      deletedByUserId: editedByUserId,
    };

    const after = { ...before, ...patch };

    tx.update(receiptRef, patch);

    tx.set(
      revRef,
      makeRevisionPayload({
        action: "delete",
        receiptId,
        editedByUserId,
        before,
        after,
        patch,
      })
    );
  });
}

/**
 * CREATE: optional – wenn du beim Erstellen direkt eine "create"-Revision willst.
 * (Falls du das nicht willst, kannst du diese Funktion ignorieren.)
 */
export async function createReceiptCreateRevision(params: {
  receiptId: string;
  editedByUserId: string;
}) {
  const { receiptId, editedByUserId } = params;
  const receiptRef = doc(db, "receipts", receiptId);
  const revRef = doc(collection(receiptRef, "revisions"));

  // wir lesen einmal "after" und schreiben Revision (kein Transaction nötig)
  const snap = await getDoc(receiptRef);
  if (!snap.exists()) return;
  const after = snap.data() as ReceiptData;

  await runTransaction(db, async (tx) => {
    tx.set(
      revRef,
      makeRevisionPayload({
        action: "create",
        receiptId,
        editedByUserId,
        before: null,
        after,
        patch: null,
      })
    );
  });
}

/**
 * Helper: receiptDateTs aus receiptDate erzeugen (für create flows)
 */
export function computeReceiptDateTsFromString(receiptDate: any) {
  return parseReceiptDateToTimestamp(receiptDate);
}
