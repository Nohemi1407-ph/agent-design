"use client";

import { useEffect, useState, useCallback } from "react";
import { TopBar } from "@/components/layout/TopBar";

interface TokenSummary {
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
}

interface GuestInfo {
  name: string;
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
  tokens: {
    guest: TokenSummary;
    owner: TokenSummary;
  };
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

export default function AdminPage() {
  const [info, setInfo] = useState<GuestInfo | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/guest");
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setInfo(data);
      setNameDraft(data.name || "");
    }
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
      setMsg(`Granted ${n} kie.ai credits`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    const n = nameDraft.trim();
    if (!n) return;
    const res = await fetch("/api/admin/guest", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n }),
    });
    if (res.ok) {
      setEditingName(false);
      await load();
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">
              Guest:{" "}
              {editingName ? (
                <span className="inline-flex gap-2">
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    className="rounded border border-border bg-background px-2 py-1 text-sm"
                  />
                  <button onClick={saveName} className="text-xs px-2 py-1 rounded bg-accent text-white">
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setEditingName(false);
                      setNameDraft(info?.name || "");
                    }}
                    className="text-xs px-2 py-1 rounded border border-border"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <>
                  <span className="font-normal">{info?.name || "Invitado"}</span>
                  <button
                    onClick={() => setEditingName(true)}
                    className="ml-2 text-xs text-accent underline"
                  >
                    edit
                  </button>
                </>
              )}
            </h2>
          </div>
          {!info ? (
            <p className="text-sm text-foreground/60">Loading...</p>
          ) : (
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-foreground/60">Balance (kie)</div>
                <div className="text-2xl font-semibold">{info.balance}</div>
              </div>
              <div>
                <div className="text-foreground/60">Used (kie)</div>
                <div className="text-2xl font-semibold">{info.used}</div>
              </div>
              <div>
                <div className="text-foreground/60">Cap (kie)</div>
                <div className="text-2xl font-semibold">{info.cap}</div>
              </div>
            </div>
          )}
          <p className="mt-3 text-xs text-foreground/60">
            Cap and balance are in REAL kie.ai credits (same unit as your kie.ai account).
          </p>
        </section>

        <section className="rounded-xl border border-border bg-surface/50 p-5">
          <h2 className="font-semibold mb-3">Add kie.ai credits to guest</h2>
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

        {info?.tokens && (
          <section className="rounded-xl border border-border bg-surface/50 p-5">
            <h2 className="font-semibold mb-3">Anthropic token spend</h2>
            <div className="grid grid-cols-2 gap-6 text-sm">
              {(["owner", "guest"] as const).map((who) => {
                const t = info.tokens[who];
                return (
                  <div key={who}>
                    <div className="text-foreground/60 capitalize mb-1">
                      {who === "guest" ? info.name : "Owner"}
                    </div>
                    <div>Input: <span className="font-mono">{t.inputTokens.toLocaleString()}</span></div>
                    <div>Output: <span className="font-mono">{t.outputTokens.toLocaleString()}</span></div>
                    <div className="mt-1 font-semibold">≈ {fmtUsd(t.estimatedUsd)}</div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-foreground/60">
              Claude Sonnet 4.5: $3/MTok input, $15/MTok output.
            </p>
          </section>
        )}

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
