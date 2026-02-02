"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";

type Category = { id: string; name: string; isActive: boolean };

type Receipt = {
  ownerUserId: string;
  categoryId: string;
  categoryName: string;
  amountCents: number;
  receiptDate: string;
  submittedAt?: any;

  updatedAt?: any;
  updatedByUserId?: string;
  updatedByEmail?: string;
  updatedByName?: string;
  editCount?: number;
};

function parseEuroToCents(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function centsToEuroInput(cents: number) {
  const v = (cents ?? 0) / 100;
  // fürs Input lieber "145,89"
  return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function EditReceiptPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const receiptId = params.id;

  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // form fields
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [receiptDate, setReceiptDate] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId]
  );

  // Auth + Rolle
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
        setIsAdmin((snap.data()?.role ?? "user") === "admin");
      } catch {
        setIsAdmin(false);
      }
    });
    return () => unsub();
  }, [router]);

  // Load categories (active)
  useEffect(() => {
    async function loadCats() {
      const q = query(collection(db, "categories"), where("isActive", "==", true));
      const snap = await getDocs(q);
      const list: Category[] = snap.docs
        .map((d) => {
          const data = d.data() as any;
          return { id: d.id, name: data.name ?? "", isActive: data.isActive ?? true };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "de"));
      setCategories(list);
    }
    loadCats();
  }, []);

  // Load receipt
  useEffect(() => {
    async function load() {
      if (!user) return;
      setLoading(true);
      setError("");

      try {
        const snap = await getDoc(doc(db, "receipts", receiptId));
        if (!snap.exists()) {
          setError("Beleg nicht gefunden.");
          setLoading(false);
          return;
        }

        const data = snap.data() as any;
        const r: Receipt = {
          ownerUserId: data.ownerUserId,
          categoryId: data.categoryId ?? "",
          categoryName: data.categoryName ?? "",
          amountCents: data.amountCents ?? 0,
          receiptDate: data.receiptDate ?? "",
          submittedAt: data.submittedAt,

          updatedAt: data.updatedAt,
          updatedByUserId: data.updatedByUserId,
          updatedByEmail: data.updatedByEmail,
          updatedByName: data.updatedByName,
          editCount: data.editCount ?? 0,
        };

        // Rechte: Owner oder Admin
        if (!isAdmin && r.ownerUserId !== user.uid) {
          setError("Keine Berechtigung, diesen Beleg zu bearbeiten.");
          setLoading(false);
          return;
        }

        setReceipt(r);
        setCategoryId(r.categoryId);
        setAmount(centsToEuroInput(r.amountCents));
        setReceiptDate(r.receiptDate);
      } catch (e: any) {
        setError(e?.message ?? "Fehler beim Laden.");
      } finally {
        setLoading(false);
      }
    }

    if (user && receiptId) load();
  }, [user, receiptId, isAdmin]);

  async function save() {
    setError("");
    if (!user || !receipt) return;

    const amountCents = parseEuroToCents(amount);
    if (amountCents == null) return setError("Bitte einen gültigen Betrag eingeben.");
    if (!receiptDate) return setError("Bitte Rechnungsdatum auswählen.");
    if (!categoryId) return setError("Bitte Kategorie auswählen.");

    setBusy(true);
    try {
      const receiptRef = doc(db, "receipts", receiptId);
      const revRef = doc(collection(db, "receipts", receiptId, "revisions")); // auto id

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(receiptRef);
        if (!snap.exists()) throw new Error("Beleg nicht gefunden.");

        const current = snap.data() as any;

        // Permission check (zusätzlich zu Rules)
        const ownerUserId = current.ownerUserId;
        if (ownerUserId !== user.uid && !isAdmin) {
          throw new Error("Keine Berechtigung.");
        }

        const before = {
          categoryId: current.categoryId ?? "",
          categoryName: current.categoryName ?? "",
          amountCents: current.amountCents ?? 0,
          receiptDate: current.receiptDate ?? "",
        };

        const after = {
          categoryId,
          categoryName: selectedCategory?.name ?? "",
          amountCents,
          receiptDate,
        };

        // Revision (Audit Trail)
        tx.set(revRef, {
          receiptId,
          editedAt: serverTimestamp(),
          editedByUserId: user.uid,
          editedByEmail: user.email ?? "",
          editedByName: user.displayName ?? "",

          before,
          after,
        });

        // Receipt aktualisieren
        tx.update(receiptRef, {
          categoryId: after.categoryId,
          categoryName: after.categoryName,
          amountCents: after.amountCents,
          receiptDate: after.receiptDate,

          updatedAt: serverTimestamp(),
          updatedByUserId: user.uid,
          updatedByEmail: user.email ?? "",
          updatedByName: user.displayName ?? "",
          editCount: (current.editCount ?? 0) + 1,
        });
      });

      router.push("/");
    } catch (e: any) {
      setError(e?.message ?? "Fehler beim Speichern.");
    } finally {
      setBusy(false);
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
    <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 720 }}>
      <h1>Beleg bearbeiten</h1>

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {loading && <p style={{ opacity: 0.7 }}>Lade…</p>}

      {receipt && !loading && (
        <>
          <p style={{ opacity: 0.75 }}>
            Letzte Änderung:{" "}
            <b>{receipt.updatedByName || receipt.updatedByEmail || "—"}</b>
            {" · "}
            Änderungen: <b>{receipt.editCount ?? 0}</b>
          </p>

          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <label>
              <div style={{ marginBottom: 6 }}>Kategorie</div>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div style={{ marginBottom: 6 }}>Betrag (€)</div>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="z.B. 12,34"
                inputMode="decimal"
                style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>

            <label>
              <div style={{ marginBottom: 6 }}>Rechnungsdatum</div>
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={save}
                disabled={busy}
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  cursor: "pointer",
                }}
              >
                {busy ? "Speichere…" : "Speichern"}
              </button>

              <button
                onClick={() => router.push("/")}
                disabled={busy}
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
