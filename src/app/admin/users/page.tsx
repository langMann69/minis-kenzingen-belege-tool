"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";

type Role = "user" | "admin" | "owner";
type Status = "pending" | "approved" | "denied";

type UserDoc = {
  id: string; // Firestore doc id
  uid: string;
  email: string;
  name?: string;
  role?: Role;
  status?: Status;
  createdAt?: any;
  lastLoginAt?: any;

  approvedAt?: any;
  approvedBy?: string;
  deniedAt?: any;
  deniedBy?: string;

  roleUpdatedAt?: any;
  roleUpdatedBy?: string;
};

type WhitelistItem = {
  id: string; // emailLower as doc id
  email: string;
  note?: string;
  createdAt?: any;
  createdBy?: string;
};

function mapUserDocs(snap: any): UserDoc[] {
  return snap.docs.map((d: any) => {
    const data = d.data() as any;
    return {
      ...data,
      id: d.id,
      uid: data.uid ?? d.id,
      email: data.email ?? "",
    } as UserDoc;
  });
}

export default function AdminUsersPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);

  // Owner-only
  const [isOwner, setIsOwner] = useState(false);

  const [error, setError] = useState("");

  const [pending, setPending] = useState<UserDoc[]>([]);
  const [approved, setApproved] = useState<UserDoc[]>([]);
  const [denied, setDenied] = useState<UserDoc[]>([]);

  const [whitelist, setWhitelist] = useState<WhitelistItem[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newNote, setNewNote] = useState("");

  // Guard: nur Owner
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
        const role = (snap.data()?.role ?? "user") as Role;
        const ok = role === "owner";
        setIsOwner(ok);
        if (!ok) router.replace("/admin");
      } catch {
        router.replace("/admin");
      }
    });

    return () => unsub();
  }, [router]);

  // Live: users by status
  useEffect(() => {
    if (!authUser || !isOwner) return;

    const usersCol = collection(db, "users");

    const unsubPending = onSnapshot(
      query(usersCol, where("status", "==", "pending"), orderBy("lastLoginAt", "desc")),
      (snap) => setPending(mapUserDocs(snap)),
      (e) => setError(e.message)
    );

    const unsubApproved = onSnapshot(
      query(usersCol, where("status", "==", "approved"), orderBy("lastLoginAt", "desc")),
      (snap) => setApproved(mapUserDocs(snap)),
      (e) => setError(e.message)
    );

    const unsubDenied = onSnapshot(
      query(usersCol, where("status", "==", "denied"), orderBy("lastLoginAt", "desc")),
      (snap) => setDenied(mapUserDocs(snap)),
      (e) => setError(e.message)
    );

    return () => {
      unsubPending();
      unsubApproved();
      unsubDenied();
    };
  }, [authUser, isOwner]);

  // Live: whitelist
  useEffect(() => {
    if (!authUser || !isOwner) return;

    const unsub = onSnapshot(
      query(collection(db, "whitelist"), orderBy("createdAt", "desc")),
      (snap) => {
        const list: WhitelistItem[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            email: data.email ?? d.id,
            note: data.note ?? "",
            createdAt: data.createdAt,
            createdBy: data.createdBy ?? "",
          };
        });
        setWhitelist(list);
      },
      (e) => setError(e.message)
    );

    return () => unsub();
  }, [authUser, isOwner]);

  async function approve(uid: string) {
    setError("");
    try {
      await updateDoc(doc(db, "users", uid), {
        status: "approved",
        approvedAt: serverTimestamp(),
        approvedBy: authUser?.uid ?? "",
      });
    } catch (e: any) {
      setError(e?.message ?? "Approve fehlgeschlagen.");
    }
  }

  async function deny(uid: string) {
    setError("");
    try {
      await updateDoc(doc(db, "users", uid), {
        status: "denied",
        deniedAt: serverTimestamp(),
        deniedBy: authUser?.uid ?? "",
      });
    } catch (e: any) {
      setError(e?.message ?? "Deny fehlgeschlagen.");
    }
  }

  // Owner-only: user -> admin (niemals owner verändern)
  async function makeAdmin(uid: string) {
    setError("");
    try {
      await updateDoc(doc(db, "users", uid), {
        role: "admin",
        roleUpdatedAt: serverTimestamp(),
        roleUpdatedBy: authUser?.uid ?? "",
      });
    } catch (e: any) {
      setError(e?.message ?? "Admin setzen fehlgeschlagen.");
    }
  }

  // Owner-only: admin -> user (owner bleibt unantastbar)
  async function revokeAdmin(uid: string) {
    setError("");
    try {
      await updateDoc(doc(db, "users", uid), {
        role: "user",
        roleUpdatedAt: serverTimestamp(),
        roleUpdatedBy: authUser?.uid ?? "",
      });
    } catch (e: any) {
      setError(e?.message ?? "Admin entziehen fehlgeschlagen.");
    }
  }

  async function addWhitelist() {
    setError("");
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError("Bitte eine gültige E-Mail eingeben.");
      return;
    }

    try {
      await setDoc(doc(db, "whitelist", email), {
        email,
        note: newNote.trim(),
        createdAt: serverTimestamp(),
        createdBy: authUser?.uid ?? "",
      });

      setNewEmail("");
      setNewNote("");
    } catch (e: any) {
      setError(e?.message ?? "Whitelist Eintrag fehlgeschlagen.");
    }
  }

  async function removeWhitelist(emailLower: string) {
    setError("");
    try {
      await deleteDoc(doc(db, "whitelist", emailLower));
    } catch (e: any) {
      setError(e?.message ?? "Whitelist löschen fehlgeschlagen.");
    }
  }

  const counts = useMemo(
    () => ({
      pending: pending.length,
      approved: approved.length,
      denied: denied.length,
      whitelist: whitelist.length,
    }),
    [pending.length, approved.length, denied.length, whitelist.length]
  );

  if (!ready) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Lade…</p>
      </main>
    );
  }

  if (!authUser || !isOwner) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Keine Berechtigung.</p>
      </main>
    );
  }

  function RolePill({ role }: { role: Role }) {
    const label =
      role === "owner" ? "owner" : role === "admin" ? "admin" : "user";
    return (
      <span
        style={{
          fontSize: 12,
          opacity: 0.8,
          border: "1px solid #ddd",
          borderRadius: 999,
          padding: "2px 8px",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    );
  }

  const currentUid = authUser.uid;

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
        <h1 style={{ marginTop: 0 }}>Nutzerverwaltung (Owner)</h1>
        <Link href="/admin" style={{ opacity: 0.8 }}>
          ← Admin-Zentrale
        </Link>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <p style={{ opacity: 0.75 }}>
        Pending: <b>{counts.pending}</b> · Approved: <b>{counts.approved}</b> ·
        Denied: <b>{counts.denied}</b> · Whitelist: <b>{counts.whitelist}</b>
      </p>

      {/* Whitelist */}
      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 14,
          padding: 14,
          marginTop: 14,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Whitelist</h2>
        <p style={{ opacity: 0.75 }}>
          Emails hier werden beim Login automatisch auf <b>approved</b> gesetzt
          (sofern nicht zuvor denied).
        </p>

        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="E-Mail (lower/normal egal)"
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ccc",
            }}
          />
          <input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Notiz (optional)"
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ccc",
            }}
          />
          <button
            onClick={addWhitelist}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
            }}
          >
            + Zur Whitelist hinzufügen
          </button>
        </div>

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {whitelist.map((w) => (
            <div
              key={w.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 10,
              }}
            >
              <div>
                <div style={{ fontWeight: 800 }}>{w.email}</div>
                {w.note && <div style={{ opacity: 0.75 }}>{w.note}</div>}
              </div>
              <button
                onClick={() => removeWhitelist(w.id)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #f2b8b5",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Entfernen
              </button>
            </div>
          ))}
          {whitelist.length === 0 && (
            <p style={{ opacity: 0.7 }}>Noch keine Whitelist-Einträge.</p>
          )}
        </div>
      </section>

      {/* Pending requests */}
      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 14,
          padding: 14,
          marginTop: 14,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Anfragen (pending)</h2>
        <p style={{ opacity: 0.75 }}>
          Diese Nutzer haben sich eingeloggt, sind aber noch nicht freigegeben.
        </p>

        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {pending.map((u) => {
            const currentRole: Role = (u.role ?? "user") as Role;

            const isTargetOwner = currentRole === "owner";
            const isTargetAdmin = currentRole === "admin";
            const isSelf = u.uid === currentUid;

            const canMakeAdmin = !isTargetOwner && !isTargetAdmin;
            const canRevokeAdmin = !isTargetOwner && isTargetAdmin && !isSelf;

            return (
              <div
                key={u.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>
                    {u.name || "—"}{" "}
                    {isSelf && (
                      <span style={{ fontSize: 12, opacity: 0.7 }}>
                        (du)
                      </span>
                    )}
                  </div>
                  <div style={{ opacity: 0.8 }}>{u.email || "—"}</div>
                  <div style={{ opacity: 0.6, fontSize: 12 }}>uid: {u.uid}</div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <RolePill role={currentRole} />

                  <button
                    onClick={() => approve(u.uid)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "white",
                      cursor: "pointer",
                    }}
                  >
                    Approve
                  </button>

                  <button
                    onClick={() => deny(u.uid)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #f2b8b5",
                      background: "white",
                      cursor: "pointer",
                    }}
                  >
                    Deny
                  </button>

                  <button
                    onClick={() => makeAdmin(u.uid)}
                    disabled={!canMakeAdmin}
                    title={
                      !canMakeAdmin
                        ? "Nur user → admin möglich (owner/admin bleiben erhalten)."
                        : "Zu Admin machen"
                    }
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "white",
                      cursor: canMakeAdmin ? "pointer" : "not-allowed",
                      opacity: canMakeAdmin ? 1 : 0.5,
                    }}
                  >
                    Make Admin
                  </button>

                  <button
                    onClick={() => revokeAdmin(u.uid)}
                    disabled={!canRevokeAdmin}
                    title={
                      !canRevokeAdmin
                        ? isTargetOwner
                          ? "Owner kann nicht herabgestuft werden."
                          : isSelf
                            ? "Du kannst dir selbst Admin nicht entziehen."
                            : "Nur admin → user möglich."
                        : "Admin entziehen (admin → user)"
                    }
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #f2b8b5",
                      background: "white",
                      cursor: canRevokeAdmin ? "pointer" : "not-allowed",
                      opacity: canRevokeAdmin ? 1 : 0.5,
                    }}
                  >
                    Admin entziehen
                  </button>
                </div>
              </div>
            );
          })}

          {pending.length === 0 && (
            <p style={{ opacity: 0.7 }}>Keine offenen Anfragen.</p>
          )}
        </div>
      </section>

      {/* Approved & Denied quick overview */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginTop: 14,
        }}
      >
        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 14 }}>
          <h2 style={{ marginTop: 0 }}>Approved</h2>

          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {approved.slice(0, 10).map((u) => {
              const currentRole: Role = (u.role ?? "user") as Role;

              const isTargetOwner = currentRole === "owner";
              const isTargetAdmin = currentRole === "admin";
              const isSelf = u.uid === currentUid;

              const canMakeAdmin = !isTargetOwner && !isTargetAdmin;
              const canRevokeAdmin = !isTargetOwner && isTargetAdmin && !isSelf;

              return (
                <div
                  key={u.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 10,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800 }}>
                      {u.name || "—"}{" "}
                      {isSelf && (
                        <span style={{ fontSize: 12, opacity: 0.7 }}>(du)</span>
                      )}
                    </div>
                    <div style={{ opacity: 0.8 }}>{u.email || "—"}</div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <RolePill role={currentRole} />

                    <button
                      onClick={() => makeAdmin(u.uid)}
                      disabled={!canMakeAdmin}
                      title={
                        !canMakeAdmin
                          ? "Nur user → admin möglich (owner/admin bleiben erhalten)."
                          : "Zu Admin machen"
                      }
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "white",
                        cursor: canMakeAdmin ? "pointer" : "not-allowed",
                        opacity: canMakeAdmin ? 1 : 0.5,
                      }}
                    >
                      Make Admin
                    </button>

                    <button
                      onClick={() => revokeAdmin(u.uid)}
                      disabled={!canRevokeAdmin}
                      title={
                        !canRevokeAdmin
                          ? isTargetOwner
                            ? "Owner kann nicht herabgestuft werden."
                            : isSelf
                              ? "Du kannst dir selbst Admin nicht entziehen."
                              : "Nur admin → user möglich."
                          : "Admin entziehen (admin → user)"
                      }
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #f2b8b5",
                        background: "white",
                        cursor: canRevokeAdmin ? "pointer" : "not-allowed",
                        opacity: canRevokeAdmin ? 1 : 0.5,
                      }}
                    >
                      Admin entziehen
                    </button>
                  </div>
                </div>
              );
            })}

            {approved.length === 0 && <p style={{ opacity: 0.7 }}>Noch keine approved User.</p>}
            {approved.length > 10 && <p style={{ opacity: 0.7 }}>… und {approved.length - 10} weitere</p>}
          </div>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 14 }}>
          <h2 style={{ marginTop: 0 }}>Denied</h2>

          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {denied.slice(0, 10).map((u) => (
              <div key={u.id} style={{ border: "1px solid #eee", borderRadius: 12, padding: 10 }}>
                <div style={{ fontWeight: 800 }}>{u.name || "—"}</div>
                <div style={{ opacity: 0.8 }}>{u.email || "—"}</div>
                <div style={{ opacity: 0.6, fontSize: 12 }}>role: {u.role ?? "user"}</div>
              </div>
            ))}

            {denied.length === 0 && <p style={{ opacity: 0.7 }}>Noch keine denied User.</p>}
            {denied.length > 10 && <p style={{ opacity: 0.7 }}>… und {denied.length - 10} weitere</p>}
          </div>
        </div>
      </section>

      <p style={{ marginTop: 14, opacity: 0.65, fontSize: 12 }}>
        Hinweis: Owner kann nicht herabgestuft werden. Admin kann nur durch Owner entzogen werden (admin → user).
      </p>
    </main>
  );
}
