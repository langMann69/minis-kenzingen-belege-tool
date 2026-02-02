"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  documentId,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";

type Receipt = {
  id: string;
  ownerUserId: string;
  categoryName: string;
  amountCents: number;
  receiptDate: string;
  submittedAt?: any;
  file?: { downloadUrl?: string; name?: string };
  deletedAt?: any;
  updatedByName?: string;
  updatedByEmail?: string;
  editCount?: number;
};

function centsToEuro(cents: number) {
  const v = (cents ?? 0) / 100;
  return v.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default function AdminReceiptsPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const [items, setItems] = useState<Receipt[]>([]);
  const [error, setError] = useState("");

  const [showDeleted, setShowDeleted] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

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

  // Live load all receipts (Admin)
  useEffect(() => {
    if (!user || !isAdmin) return;

    // Für MVP: alle receipts live laden
    const q = query(
      collection(db, "receipts"),
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
            file: data.file ?? {},
            deletedAt: data.deletedAt,
            updatedByName: data.updatedByName ?? "",
            updatedByEmail: data.updatedByEmail ?? "",
            editCount: data.editCount ?? 0,
          };
        });
        setItems(list);
      },
      (e) => setError(e.message)
    );

    return () => unsub();
  }, [user, isAdmin]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter((r) => {
      if (!showDeleted && r.deletedAt) return false;
      if (categoryFilter && r.categoryName !== categoryFilter) return false;

      if (!s) return true;

      const hay =
        `${r.categoryName} ${r.receiptDate} ${r.ownerUserId} ${r.file?.name ?? ""}`
          .toLowerCase();

      return hay.includes(s);
    });
  }, [items, showDeleted, search, categoryFilter]);

  const sum = useMemo(
    () => filtered.reduce((acc, r) => acc + (r.amountCents ?? 0), 0),
    [filtered]
  );

  const categoryOptions = useMemo(() => {
    const set = new Set(items.map((r) => r.categoryName).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "de"));
  }, [items]);

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
        <h1 style={{ marginTop: 0 }}>Belege (Admin)</h1>
        <Link href="/admin" style={{ opacity: 0.8 }}>← Admin-Zentrale</Link>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 14,
          padding: 12,
          display: "grid",
          gap: 10,
          marginTop: 12,
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche (Kategorie, Datum, Datei, UID)…"
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc", minWidth: 260 }}
          />

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          >
            <option value="">Alle Kategorien</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
            Gelöschte anzeigen
          </label>
        </div>

        <div style={{ opacity: 0.75 }}>
          Anzahl: <b>{filtered.length}</b> · Summe: <b>{centsToEuro(sum)}</b>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {filtered.map((r) => (
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
              <div style={{ fontWeight: 800 }}>
                {r.categoryName || "—"}{" "}
                {r.deletedAt && <span style={{ opacity: 0.7, fontWeight: 600 }}>(gelöscht)</span>}
              </div>

              <div style={{ opacity: 0.8 }}>
                Betrag: <b>{centsToEuro(r.amountCents)}</b> · Rechnungsdatum: <b>{r.receiptDate || "—"}</b>
              </div>

              <div style={{ opacity: 0.7, marginTop: 4 }}>
                Owner UID: <b>{r.ownerUserId}</b>
              </div>

              {(r.editCount ?? 0) > 0 && (
                <div style={{ opacity: 0.65, marginTop: 6 }}>
                  Zuletzt bearbeitet von{" "}
                  <b>{r.updatedByName || r.updatedByEmail || "—"}</b> · Änderungen:{" "}
                  <b>{r.editCount}</b>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Link
                href={`/admin/receipts/${r.id}/history`}
                style={{
                  textDecoration: "none",
                  border: "1px solid #ddd",
                  padding: "8px 10px",
                  borderRadius: 10,
                  color: "black",
                }}
              >
                History
              </Link>

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
                <span style={{ opacity: 0.6 }}>Kein File</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p style={{ marginTop: 16, opacity: 0.75 }}>
          Keine Belege gefunden.
        </p>
      )}
    </main>
  );
}
