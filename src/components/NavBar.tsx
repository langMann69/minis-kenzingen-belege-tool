"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Role = "user" | "admin" | "owner";

type UserProfile = {
  role?: Role;
  username?: string;
  profilePhotoURL?: string;
  displayName?: string;
  photoURL?: string;
};

export default function NavBar() {
  const [role, setRole] = useState<Role>("user");
  const [signedIn, setSignedIn] = useState(false);
  const [ready, setReady] = useState(false);

  const [displayName, setDisplayName] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setSignedIn(!!u);
      setReady(true);

      if (!u) {
        setRole("user");
        setDisplayName("");
        setAvatarUrl("");
        return;
      }

      // Fallback direkt aus Firebase Auth (Google)
      const fallbackName = u.displayName ?? u.email ?? "User";
      const fallbackPhoto = u.photoURL ?? "";

      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const data = (snap.data() ?? {}) as UserProfile;

        const r = (data.role ?? "user") as Role;
        if (r === "owner") setRole("owner");
        else if (r === "admin") setRole("admin");
        else setRole("user");

        // Prefer: custom profile fields; fallback to google fields; fallback to auth
        const name =
          (data.username && data.username.trim()) ||
          (data.displayName && data.displayName.trim()) ||
          fallbackName;

        const photo =
          (data.profilePhotoURL && data.profilePhotoURL.trim()) ||
          (data.photoURL && data.photoURL.trim()) ||
          fallbackPhoto;

        setDisplayName(name);
        setAvatarUrl(photo);
      } catch {
        setRole("user");
        setDisplayName(fallbackName);
        setAvatarUrl(fallbackPhoto);
      }
    });

    return () => unsub();
  }, []);

  async function logout() {
    await signOut(auth);
  }

  if (!ready) return null;

  const hasAdminAccess = role === "admin" || role === "owner";

  return (
    <header style={styles.header}>
      <nav style={styles.nav}>
        {/* LEFT */}
        <div style={styles.left}>
          {/* Brand block */}
          <Link href="/" style={styles.brandWrap} aria-label="Zur Startseite">
            <div style={styles.brandText}>
              <div style={styles.brandTitle}>Belege Tool</div>
              <div style={styles.brandSub}>Ministranten Kenzingen</div>
            </div>

            {/* Logo unter dem Namen (wie gewünscht) */}
            <div style={styles.brandLogoWrap} aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/minis-logo.svg"
                alt=""
                width={22}
                height={22}
                style={styles.brandLogo}
              />
            </div>
          </Link>

          {signedIn && (
            <div style={styles.links}>
              <NavPill href="/" label="Meine Belege" />
              <NavPill href="/new" label="Neuer Beleg" />
              <NavPill href="/dashboard" label="Dashboard" />
              {hasAdminAccess && <NavPill href="/admin" label="Admin" />}
              <NavPill href="/profile" label="Profil" />
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div style={styles.right}>
          {!signedIn ? (
            <Link href="/login" style={styles.pill}>
              Login
            </Link>
          ) : (
            <>
              <div style={styles.userBox} title={displayName}>
                <div style={styles.avatarWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarUrl || "https://via.placeholder.com/32?text=%F0%9F%99%82"}
                    alt="Profilbild"
                    width={32}
                    height={32}
                    style={styles.avatar}
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div style={styles.userName}>{displayName || "User"}</div>
              </div>

              <button onClick={logout} style={styles.pillBtn}>
                Logout
              </button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

function NavPill({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} style={styles.pill}>
      {label}
    </Link>
  );
}

const styles: Record<string, any> = {
  header: {
    position: "sticky",
    top: 0,
    zIndex: 50,
    borderBottom: "1px solid #ececec",
    background: "rgba(255,255,255,0.9)",
    backdropFilter: "blur(8px)",
    padding: "10px 16px",
    fontFamily: "sans-serif",
  },
  nav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
  },

  left: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    minWidth: 0,
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },

  brandWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    textDecoration: "none",
    color: "black",
    border: "1px solid #eee",
    background: "white",
    borderRadius: 14,
    padding: "8px 10px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.04)",
  },
  brandText: {
    display: "grid",
    lineHeight: 1.1,
  },
  brandTitle: {
    fontWeight: 900,
    letterSpacing: -0.2,
    fontSize: 14,
  },
  brandSub: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2,
  },
  brandLogoWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    border: "1px solid #eee",
    background: "#fafafa",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    flex: "0 0 auto",
  },
  brandLogo: {
    width: 22,
    height: 22,
    objectFit: "contain",
    display: "block",
  },

  links: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  pill: {
    textDecoration: "none",
    color: "black",
    border: "1px solid #e6e6e6",
    padding: "8px 10px",
    borderRadius: 999,
    background: "white",
    fontSize: 13,
    boxShadow: "0 6px 18px rgba(0,0,0,0.03)",
    transition: "transform 120ms ease, box-shadow 120ms ease",
  },
  pillBtn: {
    border: "1px solid #e6e6e6",
    padding: "8px 10px",
    borderRadius: 999,
    background: "white",
    cursor: "pointer",
    fontSize: 13,
    boxShadow: "0 6px 18px rgba(0,0,0,0.03)",
    transition: "transform 120ms ease, box-shadow 120ms ease",
  },

  userBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid #e6e6e6",
    padding: "6px 10px",
    borderRadius: 999,
    background: "white",
    maxWidth: 260,
    boxShadow: "0 6px 18px rgba(0,0,0,0.03)",
  },
  avatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 999,
    overflow: "hidden",
    border: "1px solid #eee",
    flex: "0 0 auto",
    background: "#fafafa",
  },
  avatar: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  userName: {
    fontSize: 13,
    opacity: 0.9,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 160,
  },
};
