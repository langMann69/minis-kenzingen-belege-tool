"use client";

import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  documentId,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Receipt = {
  id: string;
  ownerUserId: string;

  categoryName: string;
  amountCents: number;
  receiptDate: string;

  submittedAt?: any;

  updatedByName?: string;
  updatedByEmail?: string;
  editCount?: number;

  deletedAt?: any;

  file?: { downloadUrl?: string; name?: string };
};

function centsToEuro(cents: number) {
  const v = (cents ?? 0) / 100;
  return v.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default function HomePage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);

  const [items, setItems] = useState<Receipt[]>([]);
  const [error, setError] = useState("");

  // Auth + Rolle
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setReady(true);

      if (!u) {
        setIsAdmin(false);
        router.replace("/login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        setIsAdmin((snap.data()?.role ?? "user") === "admin");
      } catch {
        setIsAdmin(false);
      }
    });

    return () => unsub();
  }, [router]);

  // Receipts live laden (Owner only)
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "receipts"),
      where("ownerUserId", "==", user.uid),
      orderBy("submittedAt", "desc"),
      orderBy(documentId(), "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Receipt[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            ownerUserId: data.ownerUserId ?? "",

            categoryName: data.categoryName ?? "",
            amountCents: data.amountCents ?? 0,
            receiptDate: data.receiptDate ?? "",
            submittedAt: data.submittedAt,

            updatedByName: data.updatedByName ?? "",
            updatedByEmail: data.updatedByEmail ?? "",
            editCount: data.editCount ?? 0,

            deletedAt: data.deletedAt,

            file: data.file ?? {},
          };
        });

        // Soft-Deleted ausblenden
        setItems(list.filter((r) => !r.deletedAt));
      },
      (e) => setError(e.message)
    );

    return () => unsub();
  }, [user]);

  const sum = useMemo(
    () => items.reduce((acc, r) => acc + (r.amountCents ?? 0), 0),
    [items]
  );

  async function softDelete(receiptId: string) {
    setError("");
    if (!user) return;

    const ok = confirm("Beleg wirklich löschen?\n\nEr wird nur ausgeblendet und bleibt im Hintergrund gespeichert.");
    if (!ok) return;

    try {
      const receiptRef = doc(db, "receipts", receiptId);
      const revRef = doc(collection(db, "receipts", receiptId, "revisions"));

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(receiptRef);
        if (!snap.exists()) throw new Error("Beleg nicht gefunden.");

        const current = snap.data() as any;

        // Sicherheitscheck (zusätzlich zu Rules)
        const ownerUserId = current.ownerUserId;
        if (!isAdmin && ownerUserId !== user.uid) throw new Error("Keine Berechtigung.");

        if (current.deletedAt) {
          // schon gelöscht
          return;
        }

        const before = {
          categoryId: current.categoryId ?? "",
          categoryName: current.categoryName ?? "",
          amountCents: current.amountCents ?? 0,
          receiptDate: current.receiptDate ?? "",
          file: current.file ?? {},
        };

        // Revision (Audit Trail)
        tx.set(revRef, {
          receiptId,
          action: "delete",
          editedAt: serverTimestamp(),
          editedByUserId: user.uid,
          editedByEmail: user.email ?? "",
          editedByName: user.displayName ?? "",
          before,
          after: null,
        });

        // Soft-Delete Marker
        tx.update(receiptRef, {
          deletedAt: serverTimestamp(),
          deletedByUserId: user.uid,
          deletedByEmail: user.email ?? "",
          deletedByName: user.displayName ?? "",
        });
      });
    } catch (e: any) {
      setError(e?.message ?? "Fehler beim Löschen.");
    }
  }

  if (!ready) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Lade…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "baseline",
        }}
      >
        <h1 style={{ margin: 0 }}>Meine Belege</h1>
        <Link
          href="/new"
          style={{
            textDecoration: "none",
            border: "1px solid #ddd",
            padding: "10px 12px",
            borderRadius: 10,
            color: "black",
          }}
        >
          + Neuer Beleg
        </Link>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <p style={{ opacity: 0.75 }}>
        Anzahl: <b>{items.length}</b> · Summe: <b>{centsToEuro(sum)}</b>
      </p>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {items.map((r) => (
          <div
            key={r.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 12,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{r.categoryName || "—"}</div>
              <div style={{ opacity: 0.75 }}>
                Rechnungsdatum: <b>{r.receiptDate || "—"}</b>
              </div>
              <div style={{ opacity: 0.75 }}>
                Betrag: <b>{centsToEuro(r.amountCents)}</b>
              </div>

              {(r.editCount ?? 0) > 0 && (
                <div style={{ opacity: 0.65, marginTop: 6 }}>
                  Zuletzt bearbeitet von{" "}
                  <b>{r.updatedByName || r.updatedByEmail || "—"}</b> · Änderungen:{" "}
                  <b>{r.editCount}</b>
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <Link
                href={`/receipts/${r.id}/edit`}
                style={{
                  textDecoration: "none",
                  border: "1px solid #ddd",
                  padding: "8px 10px",
                  borderRadius: 10,
                  color: "black",
                }}
              >
                Bearbeiten
              </Link>

              <button
                onClick={() => softDelete(r.id)}
                style={{
                  border: "1px solid #f2b8b5",
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Löschen
              </button>

              {r.file?.downloadUrl ? (
                <a
                  href={r.file.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    textDecoration: "none",
                    border: "1px solid #ddd",
                    padding: "8px 10px",
                    borderRadius: 10,
                    color: "black",
                  }}
                >
                  Beleg öffnen
                </a>
              ) : (
                <span style={{ opacity: 0.6 }}>Upload…</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <p style={{ marginTop: 16, opacity: 0.75 }}>
          Noch keine Belege vorhanden. Klicke oben auf <b>„Neuer Beleg“</b>.
        </p>
      )}
    </main>
  );
}
