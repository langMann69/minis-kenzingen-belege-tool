"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Role = "user" | "admin";

export default function NavBar() {
  const [role, setRole] = useState<Role>("user");
  const [signedIn, setSignedIn] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setSignedIn(!!u);
      setReady(true);

      if (!u) {
        setRole("user");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const r = (snap.data()?.role ?? "user") as Role;
        setRole(r === "admin" ? "admin" : "user");
      } catch {
        setRole("user");
      }
    });

    return () => unsub();
  }, []);

  async function logout() {
    await signOut(auth);
  }

  // Optional: Navbar erst zeigen, wenn Auth ready ist (verhindert Flackern)
  if (!ready) return null;

  return (
    <header style={styles.header}>
      <nav style={styles.nav}>
        <div style={styles.left}>
          <Link href="/" style={styles.brand}>
            Belege Tool
          </Link>

          {signedIn && (
            <>
              <Link href="/" style={styles.link}>
                Meine Belege
              </Link>
              <Link href="/new" style={styles.link}>
                Neuer Beleg
              </Link>

              {/* ✅ EIN Admin-Link statt viele Admin-Links */}
              {role === "admin" && (
                <Link href="/admin" style={styles.link}>
                  Admin
                </Link>
              )}
            </>
          )}
        </div>

        <div style={styles.right}>
          {!signedIn ? (
            <Link href="/login" style={styles.link}>
              Login
            </Link>
          ) : (
            <button onClick={logout} style={styles.button}>
              Logout
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}

const styles: Record<string, any> = {
  header: {
    borderBottom: "1px solid #e5e5e5",
    padding: "10px 16px",
    fontFamily: "sans-serif",
  },
  nav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  left: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  right: { display: "flex", alignItems: "center", gap: 10 },
  brand: {
    fontWeight: 800,
    textDecoration: "none",
    color: "black",
    marginRight: 8,
  },
  link: {
    textDecoration: "none",
    color: "black",
    border: "1px solid #ddd",
    padding: "8px 10px",
    borderRadius: 10,
    background: "white",
  },
  button: {
    border: "1px solid #ddd",
    padding: "8px 10px",
    borderRadius: 10,
    background: "white",
    cursor: "pointer",
  },
};
