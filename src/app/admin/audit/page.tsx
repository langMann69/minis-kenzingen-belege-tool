"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  collectionGroup,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { useRouter } from "next/navigation";

type Rev = {
  id: string;
  receiptId?: string;
  action?: string;
  editedByName?: string;
  editedByEmail?: string;
  editedByUserId?: string;
  editedAt?: any;
};

export default function AdminAuditPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [items, setItems] = useState<Rev[]>([]);
  const [error, setError] = useState("");

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

  useEffect(() => {
    if (!user || !isAdmin) return;

    const q = query(
      collectionGroup(db, "revisions"),
      orderBy("editedAt", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Rev[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            receiptId: data.receiptId ?? "",
            action: data.action ?? "",
            editedByName: data.editedByName ?? "",
            editedByEmail: data.editedByEmail ?? "",
            editedByUserId: data.editedByUserId ?? "",
            editedAt: data.editedAt,
          };
        });
        setItems(list);
      },
      (e) => setError(e.message)
    );

    return () => unsub();
  }, [user, isAdmin]);

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
        <h1 style={{ marginTop: 0 }}>Änderungen (Audit)</h1>
        <Link href="/admin" style={{ opacity: 0.8 }}>← Admin-Zentrale</Link>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {items.map((r) => (
          <div key={r.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800 }}>Aktion: {r.action || "—"}</div>
              <div style={{ opacity: 0.75 }}>
                {r.editedByName || r.editedByEmail || r.editedByUserId || "—"}
              </div>
            </div>
            {r.receiptId && (
              <div style={{ marginTop: 8 }}>
                <Link href={`/admin/receipts/${r.receiptId}/history`}>History öffnen</Link>
              </div>
            )}
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <p style={{ marginTop: 16, opacity: 0.75 }}>
          Noch keine Revisionen vorhanden.
        </p>
      )}
    </main>
  );
}

