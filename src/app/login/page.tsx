"use client";

import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const origin = useMemo(() => (typeof window !== "undefined" ? window.location.origin : ""), []);

  async function login() {
    setError("");
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const email = (user.email ?? "").trim();
      const emailLower = email.toLowerCase();

      const userRef = doc(db, "users", user.uid);

      // Check: exists user doc?
      const existingSnap = await getDoc(userRef);
      const existing = existingSnap.exists() ? (existingSnap.data() as any) : null;

      // Check: whitelisted?
      let whitelisted = false;
      if (emailLower) {
        const wlRef = doc(db, "whitelist", emailLower);
        const wlSnap = await getDoc(wlRef);
        whitelisted = wlSnap.exists();
      }

      // status logic:
      // - wenn schon approved -> bleibt approved
      // - wenn denied -> bleibt denied (Admin muss aktiv ändern)
      // - sonst: whitelisted => approved, sonst pending
      let nextStatus: "approved" | "pending" | "denied" = "pending";
      if (existing?.status === "approved") nextStatus = "approved";
      else if (existing?.status === "denied") nextStatus = "denied";
      else nextStatus = whitelisted ? "approved" : "pending";

      if (!existing) {
        await setDoc(userRef, {
          uid: user.uid,
          email,
          emailLower,
          name: user.displayName ?? "",
          photoURL: user.photoURL ?? "",
          role: "user",
          status: nextStatus,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
        });
      } else {
        // update "harmlos": name/email/lastLoginAt; status nur, wenn pending->approved via whitelist
        const patch: any = {
          email,
          emailLower,
          name: user.displayName ?? existing?.name ?? "",
          photoURL: user.photoURL ?? existing?.photoURL ?? "",
          lastLoginAt: serverTimestamp(),
        };

        if (existing?.status !== "denied" && existing?.status !== "approved" && whitelisted) {
          patch.status = "approved";
        }

        await updateDoc(userRef, patch);
      }

      // Redirect
      if (nextStatus === "approved") router.replace("/");
      else router.replace("/pending");
    } catch (e: any) {
      setError(e?.message ?? "Login fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Login</h1>

      <p style={{ opacity: 0.75 }}>
        Domain: <b>{origin}</b>
      </p>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <button
        onClick={login}
        disabled={busy}
        style={{
          border: "1px solid #ddd",
          padding: "10px 12px",
          borderRadius: 10,
          background: "white",
          cursor: "pointer",
        }}
      >
        {busy ? "Anmelden…" : "Mit Google anmelden"}
      </button>
    </main>
  );
}
