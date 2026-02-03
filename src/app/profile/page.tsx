"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db, storage } from "@/lib/firebase";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useRouter } from "next/navigation";
import Link from "next/link";

type ProfileDoc = {
  username?: string;
  profilePhotoURL?: string;
  displayName?: string;
  photoURL?: string;
};

export default function ProfilePage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);

  const [username, setUsername] = useState("");
  const [photoURL, setPhotoURL] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setAuthUser(u);
      setReady(true);
      setError("");
      setSavedMsg("");

      if (!u) {
        router.replace("/login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const data = (snap.data() ?? {}) as ProfileDoc;

        const initialName = data.username ?? data.displayName ?? u.displayName ?? "";
        const initialPhoto = data.profilePhotoURL ?? data.photoURL ?? u.photoURL ?? "";

        setUsername(initialName);
        setPhotoURL(initialPhoto);
      } catch (e: any) {
        setError(e?.message ?? "Profil konnte nicht geladen werden.");
      }
    });

    return () => unsub();
  }, [router]);

  async function saveProfile() {
    if (!authUser) return;
    setBusy(true);
    setError("");
    setSavedMsg("");

    const cleanName = username.trim();

    if (cleanName.length < 2) {
      setBusy(false);
      setError("Bitte einen gültigen Namen eingeben (mind. 2 Zeichen).");
      return;
    }

    try {
      await updateDoc(doc(db, "users", authUser.uid), {
        username: cleanName,
        profilePhotoURL: photoURL ?? "",
        profileUpdatedAt: serverTimestamp(),
      });
      setSavedMsg("Gespeichert ✅");
    } catch (e: any) {
      setError(e?.message ?? "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function onPickFile(file: File) {
    if (!authUser) return;
    setBusy(true);
    setError("");
    setSavedMsg("");

    try {
      // path: profile/{uid}/avatar.jpg (or keep original ext)
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const storageRef = ref(storage, `profile/${authUser.uid}/avatar.${ext}`);

      await uploadBytes(storageRef, file, { contentType: file.type });
      const url = await getDownloadURL(storageRef);

      setPhotoURL(url);
      setSavedMsg("Bild hochgeladen ✅ (noch speichern)");
    } catch (e: any) {
      setError(e?.message ?? "Upload fehlgeschlagen.");
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

  if (!authUser) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Nicht eingeloggt.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 640 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <h1 style={{ marginTop: 0 }}>Profil</h1>
        <Link href="/" style={{ opacity: 0.8 }}>
          ← zurück
        </Link>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {savedMsg && <p style={{ color: "green" }}>{savedMsg}</p>}

      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <img
            src={photoURL || "https://via.placeholder.com/80?text=🙂"}
            alt="Profilbild"
            width={80}
            height={80}
            style={{ borderRadius: 999, border: "1px solid #ddd", objectFit: "cover" }}
          />
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 12, opacity: 0.8 }}>Profilbild ändern</label>
            <input
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickFile(f);
              }}
            />
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Tipp: Quadratisches Bild sieht am besten aus.
            </div>
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Anzeigename</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy}
            placeholder="z.B. Paul Lang"
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", marginTop: 6 }}
          />
        </div>

        <button
          onClick={saveProfile}
          disabled={busy}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "white",
            cursor: "pointer",
            width: "fit-content",
          }}
        >
          {busy ? "Speichern…" : "Profil speichern"}
        </button>
      </div>
    </main>
  );
}
