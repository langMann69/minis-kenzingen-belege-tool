"use client";

import Image from "next/image";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const origin = useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
    []
  );

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

      const existingSnap = await getDoc(userRef);
      const existing = existingSnap.exists() ? (existingSnap.data() as any) : null;

      // Whitelist check (Rules erlauben read für signedIn)
      let whitelisted = false;
      if (emailLower) {
        const wlRef = doc(db, "whitelist", emailLower);
        const wlSnap = await getDoc(wlRef);
        whitelisted = wlSnap.exists();
      }

      let nextStatus: "approved" | "pending" | "denied" = "pending";
      if (existing?.status === "approved") nextStatus = "approved";
      else if (existing?.status === "denied") nextStatus = "denied";
      else nextStatus = whitelisted ? "approved" : "pending";

      const googleName = user.displayName ?? "";
      const googlePhoto = user.photoURL ?? "";

      if (!existing) {
        await setDoc(userRef, {
          uid: user.uid,
          email,
          emailLower,

          // Google identity
          displayName: googleName,
          photoURL: googlePhoto,

          // Editable profile fields (default: Google)
          username: googleName,
          profilePhotoURL: googlePhoto,

          role: "user",
          status: nextStatus,

          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
        });
      } else {
        const patch: any = {
          email,
          emailLower,
          displayName: googleName,
          photoURL: googlePhoto,
          lastLoginAt: serverTimestamp(),
        };

        // Keep username/profilePhotoURL if user already customized them
        if (existing?.username == null || existing?.username === "") patch.username = googleName;
        if (existing?.profilePhotoURL == null || existing?.profilePhotoURL === "") patch.profilePhotoURL = googlePhoto;

        // Auto-approve if whitelisted (unless denied/approved already)
        if (existing?.status !== "denied" && existing?.status !== "approved" && whitelisted) {
          patch.status = "approved";
        }

        await updateDoc(userRef, patch);
      }

      if (nextStatus === "approved") router.replace("/");
      else router.replace("/pending");
    } catch (e: any) {
      setError(e?.message ?? "Login fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          {/* Logo (lege es in public/minis-logo.png ab) */}
          <div style={styles.logoWrap} aria-hidden>
            <Image
              src="/minis-logo.svg"
              alt="Ministranten Kenzingen Logo"
              width={64}
              height={64}
              style={{ borderRadius: 14 }}
              priority
            />
          </div>

          <div>
            <h1 style={styles.h1}>Belege Tool</h1>
            <p style={styles.sub}>
              Internes Tool für die Leitungsrunde – Belege hochladen, verwalten & auswerten.
            </p>
          </div>
        </div>

        <div style={styles.infoBox}>
          <div style={styles.infoTitle}>So funktioniert’s</div>
          <ul style={styles.ul}>
            <li>Mit Google anmelden</li>
            <li>Wenn du freigeschaltet bist: Belege einreichen & Dashboard nutzen</li>
            <li>Wenn nicht: deine Anfrage landet bei der Leitung (Approve/Deny)</li>
          </ul>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <div style={{ fontWeight: 800 }}>Login fehlgeschlagen</div>
            <div style={{ opacity: 0.9, marginTop: 4, whiteSpace: "pre-wrap" }}>{error}</div>
          </div>
        )}

        <button onClick={login} disabled={busy} style={{ ...styles.primaryBtn, opacity: busy ? 0.7 : 1 }}>
          <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
            <span style={styles.googleDot} aria-hidden />
            {busy ? "Anmelden…" : "Mit Google anmelden"}
          </span>
        </button>

        <div style={styles.footer}>
          <div style={{ opacity: 0.65, fontSize: 12 }}>
            Origin: <b>{origin}</b>
          </div>
          <div style={{ opacity: 0.65, fontSize: 12 }}>
            Tipp: Wenn du Probleme mit dem Popup hast, prüfe Popup-Blocker.
          </div>
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, any> = {
  page: {
    minHeight: "calc(100vh - 60px)",
    padding: 24,
    display: "grid",
    placeItems: "center",
    fontFamily: "sans-serif",
    background:
      "radial-gradient(1200px 600px at 20% -10%, rgba(0,0,0,0.06), transparent), radial-gradient(900px 500px at 100% 0%, rgba(0,0,0,0.05), transparent)",
  },
  card: {
    width: "100%",
    maxWidth: 560,
    border: "1px solid #e5e5e5",
    borderRadius: 18,
    padding: 18,
    background: "white",
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  },
  header: {
    display: "flex",
    gap: 14,
    alignItems: "center",
  },
  logoWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    border: "1px solid #eee",
    display: "grid",
    placeItems: "center",
    background: "#fafafa",
    overflow: "hidden",
    flex: "0 0 auto",
  },
  h1: { margin: 0, fontSize: 26, letterSpacing: -0.3 },
  sub: { margin: "6px 0 0", opacity: 0.75, lineHeight: 1.4 },

  infoBox: {
    marginTop: 14,
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 12,
    background: "#fcfcfc",
  },
  infoTitle: { fontWeight: 800, marginBottom: 6 },
  ul: { margin: 0, paddingLeft: 18, opacity: 0.85, lineHeight: 1.5 },

  errorBox: {
    marginTop: 12,
    border: "1px solid #f2b8b5",
    borderRadius: 14,
    padding: 12,
    background: "#fff7f7",
    color: "#7a1f1b",
  },

  primaryBtn: {
    marginTop: 14,
    width: "100%",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontWeight: 800,
  },
  googleDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background:
      "conic-gradient(#ea4335 0 25%, #fbbc05 25% 50%, #34a853 50% 75%, #4285f4 75% 100%)",
    display: "inline-block",
  },

  footer: {
    marginTop: 12,
    display: "grid",
    gap: 6,
  },
};
