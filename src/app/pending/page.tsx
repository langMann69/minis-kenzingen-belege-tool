"use client";

import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function PendingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string>("pending");
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      setEmail(u.email ?? "");

      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const s = (snap.data()?.status ?? "pending") as string;
        setStatus(s);

        if (s === "approved") router.replace("/");
      } catch {
        setStatus("pending");
      }
    });

    return () => unsub();
  }, [router]);

  async function logout() {
    await signOut(auth);
    router.replace("/login");
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 720 }}>
      <h1>Zugriff noch nicht freigegeben</h1>

      <p style={{ opacity: 0.8 }}>
        Angemeldet als: <b>{email || "—"}</b>
      </p>

      {status === "pending" && (
        <p style={{ opacity: 0.8 }}>
          Dein Zugriff steht auf <b>„Wartet auf Freigabe“</b>.  
          Ein Admin muss dich erst zulassen.
        </p>
      )}

      {status === "denied" && (
        <p style={{ color: "crimson" }}>
          Dein Zugriff wurde <b>abgelehnt</b>. Wenn das ein Fehler ist, melde dich bei der Leitungsrunde.
        </p>
      )}

      <button
        onClick={logout}
        style={{
          border: "1px solid #ddd",
          padding: "10px 12px",
          borderRadius: 10,
          background: "white",
          cursor: "pointer",
          marginTop: 10,
        }}
      >
        Logout
      </button>
    </main>
  );
}
