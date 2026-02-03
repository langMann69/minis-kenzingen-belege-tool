"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

type Role = "user" | "admin" | "owner";

type AuditRow = {
  id: string;
  action?: "create" | "update" | "delete";
  receiptId?: string;
  editedByUserId?: string;
  createdAt?: any;
  patch?: any;
};

function formatTS(ts: any) {
  try {
    if (!ts) return "—";
    if (typeof ts?.toDate === "function") return ts.toDate().toLocaleString("de-DE");
    return String(ts);
  } catch {
    return "—";
  }
}

export default function AdminAuditPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("user");

  const [error, setError] = useState("");
  const [rows, setRows] = useState<AuditRow[]>([]);

  const hasStaffAccess = role === "admin" || role === "owner";

  // ✅ Auth + Role laden (KEIN Redirect bei "kein staff"!)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setAuthUser(u);
      setReady(true);

      if (!u) {
        router.replace("/login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const r = (snap.data()?.role ?? "user") as Role;

        if (r === "owner") setRole("owner");
        else if (r === "admin") setRole("admin");
        else setRole("user");
      } catch (e: any) {
        // NICHT redirecten – nur Fehler anzeigen
        setRole("user");
        setError(e?.message ?? "Konnte Rolle nicht laden.");
      }
    });

    return () => unsub();
  }, [router]);

  // ✅ Audit stream (nur wenn staff)
  useEffect(() => {
    if (!authUser || !hasStaffAccess) return;

    setError("");

    const q = query(
      collectionGroup(db, "revisions"),
      orderBy("createdAt", "desc"),
      limit(200)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: AuditRow[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            action: data.action,
            receiptId: data.receiptId,
            editedByUserId: data.editedByUserId,
            createdAt: data.createdAt,
            patch: data.patch ?? null,
          };
        });
        setRows(list);
      },
      (e: any) => {
        // WICHTIG: nicht redirecten, sondern Fehler zeigen
        setError(e?.message ?? "Audit konnte nicht geladen werden.");
        setRows([]);
      }
    );

    return () => unsub();
  }, [authUser, hasStaffAccess]);

  const counts = useMemo(() => {
    const c = { create: 0, update: 0, delete: 0 };
    for (const r of rows) {
      if (r.action === "create") c.create++;
      else if (r.action === "update") c.update++;
      else if (r.action === "delete") c.delete++;
    }
    return c;
  }, [rows]);

  if (!ready) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Lade…</p>
      </main>
    );
  }

  if (!authUser) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Bitte einloggen…</p>
      </main>
    );
  }

  // ✅ Kein Redirect – sauber anzeigen
  if (!hasStaffAccess) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <h1 style={{ marginTop: 0 }}>Audit</h1>
        <p style={{ color: "crimson" }}>Keine Berechtigung (nur Admin/Owner).</p>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <p style={{ opacity: 0.8 }}>
          <Link href="/admin">← Admin-Zentrale</Link> · <Link href="/">← Startseite</Link>
        </p>
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
        <h1 style={{ marginTop: 0 }}>Audit</h1>
        <Link href="/admin" style={{ opacity: 0.8 }}>
          ← Admin-Zentrale
        </Link>
      </div>

      <p style={{ opacity: 0.75 }}>
        Create <b>{counts.create}</b> · Update <b>{counts.update}</b> · Delete{" "}
        <b>{counts.delete}</b>
      </p>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              border: "1px solid #eee",
              borderRadius: 12,
              padding: 10,
              display: "grid",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 800 }}>
                {r.action ?? "—"} · receipt: {r.receiptId ?? "—"}
              </div>
              <div style={{ opacity: 0.7 }}>{formatTS(r.createdAt)}</div>
            </div>

            <div style={{ opacity: 0.8, fontSize: 12 }}>
              editedBy: {r.editedByUserId ?? "—"}
            </div>

            {r.patch && (
              <details style={{ marginTop: 4 }}>
                <summary style={{ cursor: "pointer", opacity: 0.85 }}>
                  Patch anzeigen
                </summary>
                <pre
                  style={{
                    marginTop: 8,
                    whiteSpace: "pre-wrap",
                    fontSize: 12,
                    opacity: 0.9,
                  }}
                >
                  {JSON.stringify(r.patch, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))}

        {rows.length === 0 && !error && (
          <p style={{ opacity: 0.7 }}>Noch keine Audit-Einträge vorhanden.</p>
        )}
      </div>
    </main>
  );
}
