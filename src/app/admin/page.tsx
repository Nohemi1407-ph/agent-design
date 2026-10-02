"use client";

import { useEffect, useState, useCallback } from "react";
import { TopBar } from "@/components/layout/TopBar";

interface GuestInfo {
  used: number;
  cap: number;
  balance: number;
  recent: Array<{
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    reason: string;
    createdAt: string;
  }>;
}

export default function AdminPage() {
  const [info, setInfo] = useState<GuestInfo | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/guest");
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    if (res.ok) setInfo(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const n = parseInt(amount, 10);
      if (!Number.isFinite(n) || n <= 0) {
        setMsg("Invalid amount");
        return;
      }
      const res = await fetch("/api/admin/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: n }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg(data.error || "Failed");
        return;
      }
      setMsg(`Granted ${n} credits`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) {
    return (
      <div className="min-h-screen flex flex-col">
        <TopBar title="Admin" showBack />
        <div className="p-8 text-center text-foreground/70">Forbidden — owner only.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Admin" showBack />
      <div className="p-6 max-w-2xl mx-auto w-full space-y-6">
        <section className="rounded-xl border border-border bg-surface/50 p-5">
          <h2 className="font-semibold mb-3">Guest workspace</h2>
          {!info ? (
            <p className="text-sm text-foreground/60">Loading...</p>
          ) : (
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-foreground/60">Balance</div>
                <div className="text-2xl font-semibold">{info.balance}</div>
              </div>
              <div>
                <div className="text-foreground/60">Used</div>
                <div className="text-2xl font-semibold">{info.used}</div>
              </div>
              <div>
                <div className="text-foreground/60">Cap</div>
                <div className="text-2xl font-semibold">{info.cap}</div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface/50 p-5">
          <h2 className="font-semibold mb-3">Add credits</h2>
          <form onSubmit={grant} className="flex gap-2">
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Grant
            </button>
          </form>
          {msg && <p className="text-sm mt-2 text-foreground/70">{msg}</p>}
        </section>

        <section className="rounded-xl border border-border bg-surface/50 p-5">
          <h2 className="font-semibold mb-3">Recent transactions</h2>
          {info?.recent?.length ? (
            <ul className="text-sm divide-y divide-border">
              {info.recent.map((tx) => (
                <li key={tx.id} className="py-2 flex justify-between gap-3">
                  <span className="text-foreground/70">
                    {new Date(tx.createdAt).toLocaleString()} · {tx.type}
                  </span>
                  <span className="font-mono">
                    {tx.amount > 0 ? "+" : ""}
                    {tx.amount}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground/60">No activity yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
