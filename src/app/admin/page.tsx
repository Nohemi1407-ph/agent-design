"use client";

import { useEffect, useState, useCallback } from "react";
import { TopBar } from "@/components/layout/TopBar";

interface TokenSummary {
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
}

interface GuestSummary {
  id: string;
  name: string;
  createdAt: string;
  archivedAt: string | null;
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
  tokens: TokenSummary;
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

export default function AdminPage() {
  const [guests, setGuests] = useState<GuestSummary[] | null>(null);
  const [ownerTokens, setOwnerTokens] = useState<TokenSummary | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestPassword, setNewGuestPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{ id: string; password: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/admin/guests${includeArchived ? "?includeArchived=1" : ""}`,
    );
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setGuests(data.guests);
      setOwnerTokens(data.ownerTokens);
    }
  }, [includeArchived]);

  useEffect(() => {
    load();
  }, [load]);

  async function createGuest(e: React.FormEvent) {
    e.preventDefault();
    const name = newGuestName.trim();
    if (!name) {
      setMsg("Escribe un nombre primero.");
      return;
    }
    setCreating(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          password: newGuestPassword.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Failed");
        return;
      }
      setRevealed({ id: data.guest.id, password: data.plaintextPassword });
      setNewGuestName("");
      setNewGuestPassword("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function rename(id: string, name: string) {
    const res = await fetch(`/api/admin/guests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) await load();
  }

  async function regen(id: string) {
    if (!confirm("Regenerate password? The old one stops working immediately.")) return;
    const res = await fetch(`/api/admin/guests/${id}/regenerate-password`, {
      method: "POST",
    });
    const data = await res.json();
    if (res.ok) {
      setRevealed({ id, password: data.plaintextPassword });
      await load();
    }
  }

  async function grant(id: string) {
    const raw = prompt("Add how many kie.ai credits?", "100");
    if (!raw) return;
    const amount = parseInt(raw, 10);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const res = await fetch(`/api/admin/guests/${id}/grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    if (res.ok) await load();
  }

  async function toggleArchive(id: string, archived: boolean) {
    const url = archived
      ? `/api/admin/guests/${id}/unarchive`
      : `/api/admin/guests/${id}/archive`;
    const res = await fetch(url, { method: "POST" });
    if (res.ok) await load();
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
      <div className="p-6 max-w-4xl mx-auto w-full space-y-6">
        {revealed && (
          <div className="rounded-xl border border-accent bg-accent/10 p-4">
            <div className="font-semibold mb-1">
              New password for {revealed.id} — copy it now, it will not be shown again
            </div>
            <div className="flex items-center gap-2">
              <code className="font-mono text-sm bg-background px-2 py-1 rounded border border-border select-all">
                {revealed.password}
              </code>
              <button
                className="text-xs px-2 py-1 rounded bg-accent text-white"
                onClick={() => navigator.clipboard?.writeText(revealed.password)}
              >
                Copy
              </button>
              <button
                className="text-xs px-2 py-1 rounded border border-border ml-auto"
                onClick={() => setRevealed(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <section className="rounded-xl border border-border bg-surface/50 p-5">
          <h2 className="font-semibold mb-3">New guest</h2>
          <form onSubmit={createGuest} className="flex flex-wrap gap-2">
            <input
              value={newGuestName}
              onChange={(e) => setNewGuestName(e.target.value)}
              placeholder="Name"
              className="flex-1 min-w-[160px] rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              value={newGuestPassword}
              onChange={(e) => setNewGuestPassword(e.target.value)}
              placeholder="Password (blank = auto)"
              className="flex-1 min-w-[160px] rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={creating || !newGuestName.trim()}
              className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? "Creando…" : "+ New guest"}
            </button>
          </form>
          {msg && <p className="text-sm mt-2 text-foreground/70">{msg}</p>}
        </section>

        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Guests ({guests?.length ?? 0})</h2>
          <label className="text-xs text-foreground/70 inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            Show archived
          </label>
        </div>

        {!guests ? (
          <p className="text-sm text-foreground/60">Loading...</p>
        ) : guests.length === 0 ? (
          <p className="text-sm text-foreground/60">No guests yet.</p>
        ) : (
          <div className="space-y-4">
            {guests.map((g) => (
              <GuestCard
                key={g.id}
                guest={g}
                onRename={(n) => rename(g.id, n)}
                onRegen={() => regen(g.id)}
                onGrant={() => grant(g.id)}
                onArchive={() => toggleArchive(g.id, !!g.archivedAt)}
              />
            ))}
          </div>
        )}

        {ownerTokens && (
          <section className="rounded-xl border border-border bg-surface/50 p-5">
            <h2 className="font-semibold mb-3">Owner Anthropic token spend</h2>
            <div className="text-sm">
              <div>Input: <span className="font-mono">{ownerTokens.inputTokens.toLocaleString()}</span></div>
              <div>Output: <span className="font-mono">{ownerTokens.outputTokens.toLocaleString()}</span></div>
              <div className="mt-1 font-semibold">≈ {fmtUsd(ownerTokens.estimatedUsd)}</div>
            </div>
            <p className="mt-3 text-xs text-foreground/60">
              Claude Sonnet 4.5: $3/MTok input, $15/MTok output.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function GuestCard({
  guest,
  onRename,
  onRegen,
  onGrant,
  onArchive,
}: {
  guest: GuestSummary;
  onRename: (name: string) => void;
  onRegen: () => void;
  onGrant: () => void;
  onArchive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(guest.name);
  const archived = !!guest.archivedAt;

  return (
    <section
      className={`rounded-xl border border-border bg-surface/50 p-5 ${archived ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          {editing ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-sm"
              />
              <button
                onClick={() => {
                  onRename(draft);
                  setEditing(false);
                }}
                className="text-xs px-2 py-1 rounded bg-accent text-white"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setDraft(guest.name);
                  setEditing(false);
                }}
                className="text-xs px-2 py-1 rounded border border-border"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <h3 className="font-semibold">{guest.name}</h3>
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-accent underline"
              >
                edit
              </button>
              {archived && (
                <span className="text-xs text-foreground/60">(archived)</span>
              )}
            </div>
          )}
          <div className="text-xs text-foreground/50 font-mono mt-0.5">{guest.id}</div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button
            onClick={onRegen}
            className="text-xs px-2 py-1 rounded border border-border"
          >
            Regenerate password
          </button>
          <button
            onClick={onGrant}
            className="text-xs px-2 py-1 rounded bg-accent text-white"
          >
            Add credits
          </button>
          <button
            onClick={onArchive}
            className="text-xs px-2 py-1 rounded border border-border"
          >
            {archived ? "Unarchive" : "Archive"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm mb-3">
        <div>
          <div className="text-foreground/60">Balance</div>
          <div className="text-xl font-semibold">{guest.balance}</div>
        </div>
        <div>
          <div className="text-foreground/60">Used</div>
          <div className="text-xl font-semibold">{guest.used}</div>
        </div>
        <div>
          <div className="text-foreground/60">Cap</div>
          <div className="text-xl font-semibold">{guest.cap}</div>
        </div>
      </div>

      <div className="text-xs text-foreground/70 mb-3">
        Anthropic tokens: in {guest.tokens.inputTokens.toLocaleString()} / out{" "}
        {guest.tokens.outputTokens.toLocaleString()} · ≈{" "}
        <span className="font-semibold">${guest.tokens.estimatedUsd.toFixed(4)}</span>
      </div>

      {guest.recent.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-foreground/70">Recent credit tx</summary>
          <ul className="mt-2 divide-y divide-border">
            {guest.recent.map((tx) => (
              <li key={tx.id} className="py-1.5 flex justify-between gap-3">
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
        </details>
      )}
    </section>
  );
}
