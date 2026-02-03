"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";

// Recharts (falls schon im Projekt)
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";

type Role = "user" | "admin" | "owner";

type Receipt = {
  id: string;

  ownerUserId: string;
  uploadedByUserId: string;

  categoryId: string;
  categoryName: string;

  amountCents: number;
  currency: "EUR" | string;

  receiptDate: string; // "YYYY-MM-DD"
  receiptDateTs?: any; // optional Timestamp
  submittedAt?: any;

  deletedAt?: any | null;
};

type UserDoc = {
  id: string;
  uid?: string;
  email?: string;
  name?: string;
  role?: Role | string;
  status?: "pending" | "approved" | "denied" | string;
};

function centsToEuro(cents: number): string {
  const v = (Number(cents || 0) / 100).toFixed(2);
  return v.replace(".", ",") + " €";
}

function parseYYYYMMDD(dateStr: string): Date | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  // 12:00 um TZ/Daylight-Probleme zu vermeiden
  return new Date(y, mo - 1, d, 12, 0, 0, 0);
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("de-DE");
}

function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return "no_data\n";
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];
  return lines.join("\n");
}

export default function DashboardPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);

  const [role, setRole] = useState<Role>("user");
  const [status, setStatus] = useState<string>("pending");
  const hasStaffAccess = role === "admin" || role === "owner";

  const [error, setError] = useState("");

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [users, setUsers] = useState<UserDoc[]>([]);

  // Filters
  const [filterUserId, setFilterUserId] = useState<string>("all"); // staff only
  const [filterCategoryId, setFilterCategoryId] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>(""); // YYYY-MM-DD
  const [toDate, setToDate] = useState<string>(""); // YYYY-MM-DD
  const [includeDeleted, setIncludeDeleted] = useState(false);

  // Auth + role/status (kein Redirect-Loop)
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
        const data = (snap.data() ?? {}) as any;

        const r = (data.role ?? "user") as Role;
        const s = (data.status ?? "pending") as string;

        if (r === "owner") setRole("owner");
        else if (r === "admin") setRole("admin");
        else setRole("user");

        setStatus(s);

        // Nur wenn wirklich nicht approved und nicht staff → pending
        const staff = r === "admin" || r === "owner";
        if (!staff && s !== "approved") router.replace("/pending");
      } catch (e: any) {
        setError(e?.message ?? "Konnte Nutzerrolle nicht laden.");
        setRole("user");
        setStatus("pending");
        router.replace("/pending");
      }
    });

    return () => unsub();
  }, [router]);

  // Live receipts (index-frei!)
  useEffect(() => {
    if (!authUser) return;

    setError("");

    const col = collection(db, "receipts");

    // ✅ staff: alle receipts (ohne orderBy)
    if (hasStaffAccess) {
      const unsub = onSnapshot(
        query(col),
        (snap) => {
          const list: Receipt[] = snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              ownerUserId: data.ownerUserId ?? "",
              uploadedByUserId: data.uploadedByUserId ?? "",
              categoryId: data.categoryId ?? "",
              categoryName: data.categoryName ?? "",
              amountCents: Number(data.amountCents ?? 0),
              currency: data.currency ?? "EUR",
              receiptDate: data.receiptDate ?? "",
              receiptDateTs: data.receiptDateTs ?? null,
              submittedAt: data.submittedAt ?? null,
              deletedAt: data.deletedAt ?? null,
            };
          });
          setReceipts(list);
        },
        (e: any) => setError(e?.message ?? "Receipts konnten nicht geladen werden.")
      );

      return () => unsub();
    }

    // ✅ normal user: nur eigene receipts (ohne orderBy)
    const qUser = query(col, where("ownerUserId", "==", authUser.uid));
    const unsub = onSnapshot(
      qUser,
      (snap) => {
        const list: Receipt[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            ownerUserId: data.ownerUserId ?? "",
            uploadedByUserId: data.uploadedByUserId ?? "",
            categoryId: data.categoryId ?? "",
            categoryName: data.categoryName ?? "",
            amountCents: Number(data.amountCents ?? 0),
            currency: data.currency ?? "EUR",
            receiptDate: data.receiptDate ?? "",
            receiptDateTs: data.receiptDateTs ?? null,
            submittedAt: data.submittedAt ?? null,
            deletedAt: data.deletedAt ?? null,
          };
        });
        setReceipts(list);
      },
      (e: any) => setError(e?.message ?? "Deine Receipts konnten nicht geladen werden.")
    );

    return () => unsub();
  }, [authUser, hasStaffAccess]);

  // Live users (nur staff, für Personen-Filter)
  useEffect(() => {
    if (!authUser || !hasStaffAccess) return;

    const unsub = onSnapshot(
      query(collection(db, "users")),
      (snap) => {
        const list: UserDoc[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            uid: data.uid ?? d.id,
            email: data.email ?? "",
            name: data.name ?? "",
            role: data.role ?? "user",
            status: data.status ?? "pending",
          };
        });
        setUsers(list);
      },
      () => {
        // Users sind nice-to-have – wenn das failt, Dashboard trotzdem nutzbar
        setUsers([]);
      }
    );

    return () => unsub();
  }, [authUser, hasStaffAccess]);

  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) {
      const uid = u.uid ?? u.id;
      map.set(uid, u.name || u.email || uid);
    }
    return map;
  }, [users]);

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const r of receipts) {
      const id = r.categoryId || "unknown";
      const name = r.categoryName || "Unbekannt";
      if (!map.has(id)) map.set(id, { id, name });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [receipts]);

  const parsedReceipts = useMemo(() => {
    return receipts.map((r) => {
      const d = parseYYYYMMDD(r.receiptDate);
      return { ...r, _dateObj: d };
    });
  }, [receipts]);

  const filtered = useMemo(() => {
    const from = parseYYYYMMDD(fromDate);
    const to = parseYYYYMMDD(toDate);

    return parsedReceipts
      .filter((r) => (includeDeleted ? true : !r.deletedAt))
      .filter((r) => (hasStaffAccess && filterUserId !== "all" ? r.ownerUserId === filterUserId : true))
      .filter((r) => (filterCategoryId !== "all" ? r.categoryId === filterCategoryId : true))
      .filter((r) => {
        const d = (r as any)._dateObj as Date | null;
        if (!from && !to) return true;
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      })
      .sort((a: any, b: any) => {
        const da = (a._dateObj as Date | null)?.getTime() ?? 0;
        const dbb = (b._dateObj as Date | null)?.getTime() ?? 0;
        return dbb - da;
      });
  }, [parsedReceipts, includeDeleted, hasStaffAccess, filterUserId, filterCategoryId, fromDate, toDate]);

  const totalCents = useMemo(() => {
    return filtered.reduce((sum, r) => sum + Number(r.amountCents ?? 0), 0);
  }, [filtered]);

  const byCategory = useMemo(() => {
    const map = new Map<string, { id: string; name: string; cents: number }>();
    for (const r of filtered) {
      const id = r.categoryId || "unknown";
      const name = r.categoryName || "Unbekannt";
      const prev = map.get(id) ?? { id, name, cents: 0 };
      prev.cents += Number(r.amountCents ?? 0);
      map.set(id, prev);
    }
    const list = Array.from(map.values())
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 12)
      .map((x) => ({
        name: x.name.length > 18 ? x.name.slice(0, 18) + "…" : x.name,
        euros: Number((x.cents / 100).toFixed(2)),
      }));
    return list;
  }, [filtered]);

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      const d = (r as any)._dateObj as Date | null;
      if (!d) continue;
      const k = monthKey(d);
      map.set(k, (map.get(k) ?? 0) + Number(r.amountCents ?? 0));
    }
    const list = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, cents]) => ({
        month: k,
        euros: Number((cents / 100).toFixed(2)),
      }));
    return list;
  }, [filtered]);

  function downloadCsv() {
    const rows = filtered.map((r: any) => {
      const d = r._dateObj as Date | null;
      return {
        receiptId: r.id,
        receiptDate: r.receiptDate || "",
        receiptDatePretty: fmtDate(d),
        category: r.categoryName || "",
        ownerUserId: r.ownerUserId,
        ownerName: userNameById.get(r.ownerUserId) ?? r.ownerUserId,
        amountCents: Number(r.amountCents ?? 0),
        amountEUR: (Number(r.amountCents ?? 0) / 100).toFixed(2),
        deleted: r.deletedAt ? "yes" : "no",
      };
    });

    // Extra Summary Zeile oben
    const summary = [
      {
        receiptId: "SUMMARY",
        receiptDate: "",
        receiptDatePretty: "",
        category: "",
        ownerUserId: "",
        ownerName: "",
        amountCents: totalCents,
        amountEUR: (totalCents / 100).toFixed(2),
        deleted: "",
      },
    ];

    const csv = toCsv([...summary, ...rows]);
    downloadTextFile("dashboard_export.csv", csv, "text/csv;charset=utf-8");
  }

  if (!ready) {
    return (
      <main style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Lade…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <h1 style={{ marginTop: 0 }}>Dashboard</h1>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/" style={{ opacity: 0.8 }}>← Meine Belege</Link>
          {hasStaffAccess && <Link href="/admin" style={{ opacity: 0.8 }}>← Admin</Link>}
        </div>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <div style={{ marginTop: 10, border: "1px solid #ddd", borderRadius: 14, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ opacity: 0.75, fontSize: 12 }}>Summe (gefiltert)</div>
            <div style={{ fontWeight: 900, fontSize: 28 }}>{centsToEuro(totalCents)}</div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>
              Treffer: <b>{filtered.length}</b> · Rolle: <b>{role}</b> · Status: <b>{status}</b>
            </div>
          </div>

          <button
            onClick={downloadCsv}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
              height: 40,
            }}
            disabled={filtered.length === 0}
          >
            CSV Download
          </button>
        </div>

        {/* Filter */}
        <div style={{ display: "grid", gap: 10, marginTop: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {hasStaffAccess && (
            <label>
              <div style={{ marginBottom: 6, opacity: 0.85 }}>Person</div>
              <select
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
              >
                <option value="all">Alle</option>
                {users
                  .filter((u) => (u.status ?? "") === "approved" || (u.role ?? "") === "admin" || (u.role ?? "") === "owner")
                  .sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "", "de"))
                  .map((u) => {
                    const uid = u.uid ?? u.id;
                    const label = (u.name || u.email || uid) + (u.role === "owner" ? " (owner)" : u.role === "admin" ? " (admin)" : "");
                    return (
                      <option key={uid} value={uid}>
                        {label}
                      </option>
                    );
                  })}
              </select>
            </label>
          )}

          <label>
            <div style={{ marginBottom: 6, opacity: 0.85 }}>Kategorie</div>
            <select
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
            >
              <option value="all">Alle</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div style={{ marginBottom: 6, opacity: 0.85 }}>Von (Datum)</div>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
            />
          </label>

          <label>
            <div style={{ marginBottom: 6, opacity: 0.85 }}>Bis (Datum)</div>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
            />
          </label>

          <label style={{ display: "flex", gap: 10, alignItems: "center", paddingTop: 28 }}>
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)}
            />
            <span style={{ opacity: 0.85 }}>Gelöschte einbeziehen</span>
          </label>
        </div>
      </div>

      {/* Charts */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 14, minHeight: 320 }}>
          <h2 style={{ marginTop: 0 }}>Ausgaben nach Kategorie</h2>
          <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 8 }}>
            Top 12 Kategorien (gefiltert)
          </div>
          <div style={{ width: "100%", height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" interval={0} angle={-20} textAnchor="end" height={70} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="euros" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {byCategory.length === 0 && <p style={{ opacity: 0.7 }}>Keine Daten im aktuellen Filter.</p>}
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 14, minHeight: 320 }}>
          <h2 style={{ marginTop: 0 }}>Ausgaben pro Monat</h2>
          <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 8 }}>
            Zeitreihe (gefiltert)
          </div>
          <div style={{ width: "100%", height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="euros" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {byMonth.length === 0 && <p style={{ opacity: 0.7 }}>Keine Daten im aktuellen Filter.</p>}
        </div>
      </section>

      {/* Tabelle */}
      <section style={{ border: "1px solid #ddd", borderRadius: 14, padding: 14, marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>Belege (gefiltert)</h2>

        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {filtered.slice(0, 50).map((r: any) => {
            const d = r._dateObj as Date | null;
            return (
              <div
                key={r.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>
                    {r.categoryName || "Unbekannt"} · {centsToEuro(r.amountCents)}
                    {r.deletedAt ? <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>(gelöscht)</span> : null}
                  </div>
                  <div style={{ opacity: 0.8 }}>
                    Datum: <b>{r.receiptDate || "—"}</b> ({fmtDate(d)})
                  </div>
                  {hasStaffAccess && (
                    <div style={{ opacity: 0.7, fontSize: 12 }}>
                      Person: {userNameById.get(r.ownerUserId) ?? r.ownerUserId}
                    </div>
                  )}
                </div>

                <Link
                  href={`/receipts/${r.id}/edit`}
                  style={{
                    textDecoration: "none",
                    border: "1px solid #ddd",
                    padding: "8px 10px",
                    borderRadius: 10,
                    background: "white",
                    whiteSpace: "nowrap",
                  }}
                >
                  Öffnen
                </Link>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <p style={{ opacity: 0.7 }}>Keine Belege im aktuellen Filter.</p>
          )}
          {filtered.length > 50 && (
            <p style={{ opacity: 0.7 }}>… und {filtered.length - 50} weitere (CSV Download enthält alle).</p>
          )}
        </div>
      </section>
    </main>
  );
}
