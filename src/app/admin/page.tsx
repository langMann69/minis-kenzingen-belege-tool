"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function AdminHome() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

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
        const role = (snap.data()?.role ?? "user") as string;
        const ok = role === "admin";
        setIsAdmin(ok);
        if (!ok) router.replace("/");
      } catch {
        router.replace("/");
      }
    });

    return () => unsub();
  }, [router]);

  if (!ready) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Lade…</p>
      </main>
    );
  }

  if (!user || !isAdmin) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Keine Berechtigung.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ marginTop: 0 }}>Admin-Zentrale</h1>
      <p style={{ opacity: 0.75 }}>
        Hier sind alle Admin-Tools gebündelt.
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <Card
          title="Belege (Admin)"
          desc="Alle Belege sehen, filtern, Summen, gelöschte Belege anzeigen, History öffnen."
          href="/admin/receipts"
        />
        <Card
          title="Änderungen (Audit)"
          desc="Letzte Bearbeitungen/Löschungen aus den Revisionen (über alle Belege)."
          href="/admin/audit"
        />
        <Card
          title="Kategorien verwalten"
          desc="Kategorien anlegen, bearbeiten, löschen, deaktivieren."
          href="/admin/categories"
        />
        <Card
          title="Nutzer & Rollen"
          desc="Später: aktive Nutzer sehen, Rollen setzen, Einladungen/Whitelist."
          href="/admin/users"
          badge="später"
        />
      </div>
    </main>
  );
}

function Card({
  title,
  desc,
  href,
  badge,
}: {
  title: string;
  desc: string;
  href: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        color: "black",
        border: "1px solid #ddd",
        borderRadius: 14,
        padding: 14,
        display: "block",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        {badge && (
          <span
            style={{
              fontSize: 12,
              opacity: 0.7,
              border: "1px solid #ddd",
              borderRadius: 999,
              padding: "2px 8px",
              whiteSpace: "nowrap",
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <div style={{ marginTop: 6, opacity: 0.75 }}>{desc}</div>
    </Link>
  );
}
