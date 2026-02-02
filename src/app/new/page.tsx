"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  doc,
  where,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useRouter } from "next/navigation";
import { auth, db, storage } from "@/lib/firebase";

type Category = {
  id: string;
  name: string;
  isActive: boolean;
};

function parseEuroToCents(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  if (value < 0) return null;
  return Math.round(value * 100);
}

export default function NewReceiptPage() {
  const router = useRouter();

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);

  const [amount, setAmount] = useState(""); // € input
  const [receiptDate, setReceiptDate] = useState(""); // YYYY-MM-DD
  const [categoryId, setCategoryId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId]
  );

  // ✅ Auth robust: currentUser + onAuthStateChanged + fallback
  useEffect(() => {
    // 1) sofortiger Check
    if (auth.currentUser) {
      setAuthUser(auth.currentUser);
      setAuthReady(true);
    }

    // 2) Listener
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      setAuthReady(true);
      if (!u) router.replace("/login");
    });

    // 3) Fallback (nie wieder Endlos "Lade...")
    const t = setTimeout(() => {
      setAuthReady(true);
    }, 1500);

    return () => {
      unsub();
      clearTimeout(t);
    };
  }, [router]);

  // Kategorien laden (nur aktive)
  useEffect(() => {
    async function load() {
      setLoadingCats(true);
      try {
        const q = query(collection(db, "categories"), where("isActive", "==", true));
        const snap = await getDocs(q);
        const list: Category[] = snap.docs
          .map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              name: data.name ?? "",
              isActive: data.isActive ?? true,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name, "de"));
        setCategories(list);
        if (list.length && !categoryId) setCategoryId(list[0].id);
      } catch (e: any) {
        setError(e?.message ?? "Kategorien konnten nicht geladen werden.");
      } finally {
        setLoadingCats(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setError("");

    if (!authUser) return;
    const amountCents = parseEuroToCents(amount);
    if (amountCents == null) return setError("Bitte einen gültigen Betrag eingeben.");
    if (!receiptDate) return setError("Bitte Rechnungsdatum auswählen.");
    if (!categoryId) return setError("Bitte Kategorie auswählen.");
    if (!file) return setError("Bitte eine Datei (Foto oder PDF) auswählen.");

    if (file.size > 10 * 1024 * 1024) {
      return setError("Datei ist zu groß (max. 10MB).");
    }

    setBusy(true);
    try {
      // Optional: User-Dokument sicherstellen (falls mal keins existiert)
      await setDoc(
        doc(db, "users", authUser.uid),
        {
          uid: authUser.uid,
          email: authUser.email ?? "",
          name: authUser.displayName ?? "",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 1) Receipt anlegen
      const receiptRef = await addDoc(collection(db, "receipts"), {
        ownerUserId: authUser.uid,
        uploadedByUserId: authUser.uid,

        categoryId,
        categoryName: selectedCategory?.name ?? "",

        amountCents,
        currency: "EUR",

        receiptDate,
        submittedAt: serverTimestamp(),

        // ✅ Soft delete marker
        deletedAt: null,

        file: {
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          storagePath: "",
          downloadUrl: "",
        },
      });

      const receiptId = receiptRef.id;

      // 2) Upload nach Storage
      const safeName = file.name.replaceAll("/", "_").replaceAll("\\", "_");
      const storagePath = `receipts/${authUser.uid}/${receiptId}/${safeName}`;
      const storageRef = ref(storage, storagePath);

      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      // 3) Receipt updaten
      await updateDoc(doc(db, "receipts", receiptId), {
        "file.storagePath": storagePath,
        "file.downloadUrl": downloadUrl,
      });

      router.push("/");
    } catch (e: any) {
      setError(e?.message ?? "Fehler beim Einreichen.");
    } finally {
      setBusy(false);
    }
  }

  if (!authReady) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p><b>Auth wird geladen…</b></p>
        <p style={{ opacity: 0.7 }}>Wenn das länger als 2 Sekunden dauert, sag kurz Bescheid.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 720 }}>
      <h1>Neuen Beleg einreichen</h1>

      {!authUser && (
        <p style={{ opacity: 0.75 }}>
          Nicht eingeloggt – du wirst zum Login weitergeleitet…
        </p>
      )}

      {error && <p style={{ color: "crimson", marginTop: 12 }}>{error}</p>}

      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <label>
          <div style={{ marginBottom: 6 }}>Kategorie</div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={loadingCats || categories.length === 0}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {loadingCats && <div style={{ opacity: 0.7, marginTop: 6 }}>Lade Kategorien…</div>}
          {!loadingCats && categories.length === 0 && (
            <div style={{ opacity: 0.7, marginTop: 6 }}>
              Keine aktiven Kategorien vorhanden. Bitte erst unter /admin/categories anlegen.
            </div>
          )}
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

        <label>
          <div style={{ marginBottom: 6 }}>Beleg (Foto oder PDF)</div>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <div style={{ marginTop: 6, opacity: 0.8 }}>
              Ausgewählt: <b>{file.name}</b> ({Math.round(file.size / 1024)} KB)
            </div>
          )}
        </label>

        <button
          onClick={submit}
          disabled={busy || !authUser || categories.length === 0}
          style={{
            marginTop: 8,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #ccc",
            cursor: "pointer",
          }}
        >
          {busy ? "Lade hoch…" : "Einreichen"}
        </button>
      </div>
    </main>
  );
}
