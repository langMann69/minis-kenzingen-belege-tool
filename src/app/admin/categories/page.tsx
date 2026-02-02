"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Category = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt?: any;
};

export default function AdminCategoriesPage() {
  const [newName, setNewName] = useState("");
  const [items, setItems] = useState<Category[]>([]);
  const [busyCreate, setBusyCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  // Edit-Mode
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");

  useEffect(() => {
    const q = query(collection(db, "categories"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Category[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name ?? "",
            isActive: data.isActive ?? true,
            createdAt: data.createdAt,
          };
        });
        setItems(list);
      },
      (e) => setError(e.message)
    );

    return () => unsub();
  }, []);

  const activeCount = useMemo(() => items.filter((c) => c.isActive).length, [items]);

  async function createCategory() {
    setError("");
    const trimmed = newName.trim();
    if (!trimmed) return;

    setBusyCreate(true);
    try {
      await addDoc(collection(db, "categories"), {
        name: trimmed,
        isActive: true,
        createdAt: serverTimestamp(),
      });
      setNewName("");
    } catch (e: any) {
      setError(e?.message ?? "Fehler beim Anlegen");
    } finally {
      setBusyCreate(false);
    }
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setEditingValue(cat.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingValue("");
  }

  async function saveEdit(catId: string) {
    setError("");
    const trimmed = editingValue.trim();
    if (!trimmed) {
      setError("Name darf nicht leer sein.");
      return;
    }

    setBusyId(catId);
    try {
      await updateDoc(doc(db, "categories", catId), { name: trimmed });
      cancelEdit();
    } catch (e: any) {
      setError(e?.message ?? "Fehler beim Speichern");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(cat: Category) {
    setError("");
    setBusyId(cat.id);
    try {
      await updateDoc(doc(db, "categories", cat.id), { isActive: !cat.isActive });
    } catch (e: any) {
      setError(e?.message ?? "Fehler beim Aktualisieren");
    } finally {
      setBusyId(null);
    }
  }

  async function removeCategory(cat: Category) {
    setError("");

    // Browser-Confirm ist fürs MVP ok.
    const ok = confirm(`Kategorie wirklich löschen?\n\n"${cat.name}"`);
    if (!ok) return;

    setBusyId(cat.id);
    try {
      await deleteDoc(doc(db, "categories", cat.id));
      if (editingId === cat.id) cancelEdit();
    } catch (e: any) {
      setError(e?.message ?? "Fehler beim Löschen");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 820 }}>
      <h1>Admin · Kategorien</h1>

      <p style={{ opacity: 0.7, marginTop: 6 }}>
        Gesamt: <b>{items.length}</b> · Aktiv: <b>{activeCount}</b>
      </p>

      {/* Neu anlegen */}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Neue Kategorie (z.B. Lebensmittel)"
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #ccc",
          }}
        />
        <button
          onClick={createCategory}
          disabled={busyCreate}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #ccc",
            cursor: "pointer",
          }}
        >
          Anlegen
        </button>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12 }}>{error}</p>}

      {/* Liste */}
      <h2 style={{ marginTop: 24 }}>Vorhandene Kategorien</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {items.map((c) => {
          const isEditing = editingId === c.id;
          const isBusy = busyId === c.id;

          return (
            <div
              key={c.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: 12,
                display: "flex",
                alignItems: "center",
                gap: 10,
                justifyContent: "space-between",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                {!isEditing ? (
                  <>
                    <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                      <b style={{ fontSize: 16, wordBreak: "break-word" }}>{c.name}</b>
                      <span style={{ opacity: 0.7 }}>
                        {c.isActive ? "aktiv" : "inaktiv"}
                      </span>
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      style={{
                        flex: 1,
                        padding: 10,
                        borderRadius: 8,
                        border: "1px solid #ccc",
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {!isEditing ? (
                  <>
                    <button
                      onClick={() => startEdit(c)}
                      disabled={isBusy}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        cursor: "pointer",
                      }}
                    >
                      Bearbeiten
                    </button>

                    <button
                      onClick={() => toggleActive(c)}
                      disabled={isBusy}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        cursor: "pointer",
                      }}
                    >
                      {c.isActive ? "Deaktivieren" : "Aktivieren"}
                    </button>

                    <button
                      onClick={() => removeCategory(c)}
                      disabled={isBusy}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #f2b8b5",
                        cursor: "pointer",
                      }}
                    >
                      Löschen
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => saveEdit(c.id)}
                      disabled={isBusy}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        cursor: "pointer",
                      }}
                    >
                      Speichern
                    </button>

                    <button
                      onClick={cancelEdit}
                      disabled={isBusy}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        cursor: "pointer",
                      }}
                    >
                      Abbrechen
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ marginTop: 18, opacity: 0.7 }}>
        Hinweis: Beim Beleg-Einreichen werden später nur <b>aktive</b> Kategorien angezeigt.
      </p>
    </main>
  );
}
