"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

type Revision = {
  id: string;
  action?: string; // "update" | "delete"
  editedAt?: any;
  editedByUserId?: string;
  editedByEmail?: string;
  editedByName?: string;
  before?: any;
  after?: any;
};

export default function ReceiptHistoryPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const receiptId = params.id;

  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [items, setItems] = useState<Revision[]>([]);
  const [error, setError] = useState("");

  // Admin guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setReady(true);

      if (!u) {
        router.replace("/login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const ok = (snap.data()?.role ?? "user") === "admin";
        setIsAdmin(ok);
        if (!ok) router.replace("/");
      } catch {
        router.replace("/");
      }
    });

    return () => unsub();
  }, [router]);

  // Load revisions
  useEffect(() => {
    if (!user || !isAdmin) return;

    const q = query(
      collection(db, "receipts", receiptId, "revisions"),
      orderBy("editedAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Revision[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            action: data.action ?? "",
            editedAt: data.editedAt,
            editedByUserId: data.editedByUserId ?? "",
            editedByEmail: data.editedByEmail ?? "",
            editedByName: data.editedByName ?? "",
            before: data.before ?? null,
            after: data.after ?? null,
          };
        });
        setItems(list);
      },
      (e) => setError(e.message)
    );

    return () => unsub();
  }, [user, isAdmin, receiptId]);

  if (!ready) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Lade…</p>
      </main>
    );
  }

  if (!user || !isAdmin) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Keine Berechtigung.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <h1 style={{ marginTop: 0 }}>History: {receiptId}</h1>
        <Link href="/admin/receipts" style={{ opacity: 0.8 }}>← zurück</Link>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {items.map((r) => (
          <div key={r.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800 }}>
                Aktion: {r.action || "—"}
              </div>
              <div style={{ opacity: 0.75 }}>
                {r.editedByName || r.editedByEmail || r.editedByUserId || "—"}
              </div>
            </div>

            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer" }}>Vorher / Nachher anzeigen</summary>

              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Vorher</div>
                  <pre style={{ whiteSpace: "pre-wrap", background: "#fafafa", padding: 10, borderRadius: 10, border: "1px solid #eee" }}>
                    {JSON.stringify(r.before, null, 2)}
                  </pre>
                </div>

                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Nachher</div>
                  <pre style={{ whiteSpace: "pre-wrap", background: "#fafafa", padding: 10, borderRadius: 10, border: "1px solid #eee" }}>
                    {JSON.stringify(r.after, null, 2)}
                  </pre>
                </div>
              </div>
            </details>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <p style={{ marginTop: 16, opacity: 0.75 }}>
          Noch keine Änderungen vorhanden.
        </p>
      )}
    </main>
  );
}
