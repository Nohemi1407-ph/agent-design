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
  hasKieKey: boolean;
  hasAnthropicKey: boolean;
  status: "pending" | "active";
}

interface SignupTokenRow {
  token: string;
  createdAt: string;
  expiresAt: string;
  maxUses: number;
  uses: number;
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

export default function AdminPage() {
  const [guests, setGuests] = useState<GuestSummary[] | null>(null);
  const [ownerTokens, setOwnerTokens] = useState<TokenSummary | null>(null);
  const [ownerPool, setOwnerPool] = useState<{ kieBalance: number | null; reserved: number; available: number | null } | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [newGuestName, setNewGuestName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{ id: string; pin: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [signupTokens, setSignupTokens] = useState<SignupTokenRow[]>([]);
  const [signupCopied, setSignupCopied] = useState<string | null>(null);

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
      setOwnerPool(data.ownerPool ?? null);
    }
  }, [includeArchived]);

  const loadSignupTokens = useCallback(async () => {
    const res = await fetch("/api/admin/signup-tokens");
    if (res.ok) {
      const data = await res.json();
      setSignupTokens(data.tokens || []);
    }
  }, []);

  useEffect(() => {
    load();
    loadSignupTokens();
  }, [load, loadSignupTokens]);

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
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Failed");
        return;
      }
      setRevealed({ id: data.guest.id, pin: data.plaintextPin });
      setNewGuestName("");
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
    if (!confirm("Regenerate PIN? The old one stops working immediately.")) return;
    const res = await fetch(`/api/admin/guests/${id}/regenerate-pin`, {
      method: "POST",
    });
    const data = await res.json();
    if (res.ok) {
      setRevealed({ id, pin: data.plaintextPin });
      await load();
    }
  }

  async function copyInvite(id: string) {
    const url = `${window.location.origin}/invite/${id}`;
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {}
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

  async function resetKey(id: string, which: "kie" | "anthropic") {
    const label = which === "kie" ? "kie.ai" : "Anthropic";
    if (!confirm(`¿Resetear la ${label} key del invitado? Tendrá que volver a conectar la suya.`)) return;
    const path = which === "kie" ? "kie-key" : "anthropic-key";
    const res = await fetch(`/api/admin/guests/${id}/${path}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  async function toggleArchive(id: string, archived: boolean) {
    const url = archived
      ? `/api/admin/guests/${id}/unarchive`
      : `/api/admin/guests/${id}/archive`;
    const res = await fetch(url, { method: "POST" });
    if (res.ok) await load();
  }

  async function removeGuest(id: string, name: string) {
    if (!confirm(`¿Eliminar al invitado "${name}" (${id})? Esto borra sus créditos, keys, archivos y uso. No se puede deshacer.`)) return;
    const res = await fetch(`/api/admin/guests/${id}/delete`, { method: "POST" });
    if (res.ok) await load();
  }

  async function approve(id: string) {
    const res = await fetch(`/api/admin/guests/${id}/approve`, { method: "POST" });
    if (res.ok) await load();
  }

  async function reject(id: string, name: string) {
    if (!confirm(`¿Rechazar la solicitud de "${name}"? Se elimina su registro.`)) return;
    const res = await fetch(`/api/admin/guests/${id}/reject`, { method: "POST" });
    if (res.ok) await load();
  }

  async function createSignupToken() {
    const res = await fetch("/api/admin/signup-tokens", { method: "POST" });
    if (res.ok) await loadSignupTokens();
  }

  async function revokeSignupToken(token: string) {
    if (!confirm("¿Revocar este enlace de registro?")) return;
    const res = await fetch(`/api/admin/signup-tokens/${token}`, { method: "DELETE" });
    if (res.ok) await loadSignupTokens();
  }

  async function copySignupLink(token: string) {
    const url = `${window.location.origin}/signup/${token}`;
    try {
      await navigator.clipboard?.writeText(url);
      setSignupCopied(token);
      setTimeout(() => setSignupCopied((c) => (c === token ? null : c)), 1500);
    } catch {}
  }

  if (forbidden) {
    return (
      <div className="min-h-screen flex flex-col">
        <TopBar title="Admin" showBack />
        <div className="p-8 text-center text-foreground/70">Forbidden — owner only.</div>
      </div>
    );
  }

  const pending = guests?.filter((g) => g.status === "pending") ?? [];
  const active = guests?.filter((g) => g.status !== "pending") ?? [];

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title="Admin" showBack />
      <div className="p-6 max-w-4xl mx-auto w-full space-y-6">
        {revealed && (
          <div className="rounded-xl border border-accent bg-accent/10 p-5">
            <div className="font-semibold mb-3">
              New PIN for {revealed.id} — copy it now, it will not be shown again
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <code className="font-mono text-3xl tracking-[0.4em] bg-background px-4 py-3 rounded-lg border border-border select-all">
                {revealed.pin}
              </code>
              <button
                className="text-sm px-3 py-2 rounded bg-accent text-white"
                onClick={() => navigator.clipboard?.writeText(revealed.pin)}
              >
                Copy PIN
              </button>
              <button
                className="text-sm px-3 py-2 rounded border border-border"
                onClick={() =>
                  navigator.clipboard?.writeText(
                    `${window.location.origin}/invite/${revealed.id}`,
                  )
                }
              >
                Copy invite link
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

        <section className="rounded-xl border border-border bg-surface/50 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Signup link</h2>
            <button
              onClick={createSignupToken}
              className="text-sm px-3 py-1.5 rounded bg-accent text-white"
            >
              Generate new signup link
            </button>
          </div>
          {signupTokens.length === 0 ? (
            <p className="text-sm text-foreground/60">
              Sin enlaces activos. Genera uno para que alguien pueda registrarse.
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {signupTokens.map((t) => {
                const expired = new Date(t.expiresAt).getTime() < Date.now();
                const exhausted = t.uses >= t.maxUses;
                const url = typeof window !== "undefined"
                  ? `${window.location.origin}/signup/${t.token}`
                  : `/signup/${t.token}`;
                return (
                  <li key={t.token} className="py-3 flex items-center gap-3 flex-wrap">
                    <code className="font-mono text-xs bg-background px-2 py-1 rounded border border-border flex-1 min-w-[220px] truncate">
                      {url}
                    </code>
                    <span className="text-xs text-foreground/60">
                      {t.uses}/{t.maxUses} usos
                      {expired ? " · expirado" : ""}
                      {exhausted && !expired ? " · agotado" : ""}
                    </span>
                    <button
                      onClick={() => copySignupLink(t.token)}
                      className="text-xs px-2 py-1 rounded border border-border"
                    >
                      {signupCopied === t.token ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => revokeSignupToken(t.token)}
                      className="text-xs px-2 py-1 rounded border border-red-500/40 text-red-400"
                    >
                      Revoke
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {pending.length > 0 && (
          <section className="rounded-xl border border-yellow-500/40 bg-yellow-500/5 p-5">
            <h2 className="font-semibold mb-3">Pending approval ({pending.length})</h2>
            <ul className="divide-y divide-border">
              {pending.map((g) => (
                <li key={g.id} className="py-3 flex items-center gap-3 flex-wrap">
                  <div className="flex-1">
                    <div className="font-medium">{g.name}</div>
                    <div className="text-xs text-foreground/50 font-mono">{g.id}</div>
                  </div>
                  <button
                    onClick={() => approve(g.id)}
                    className="text-sm px-3 py-1.5 rounded bg-green-600 text-white"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => reject(g.id, g.name)}
                    className="text-sm px-3 py-1.5 rounded border border-red-500/40 text-red-400"
                  >
                    Reject
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Guests ({active.length})</h2>
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
        ) : active.length === 0 ? (
          <p className="text-sm text-foreground/60">No guests yet.</p>
        ) : (
          <div className="space-y-4">
            {active.map((g) => (
              <GuestCard
                key={g.id}
                guest={g}
                copied={copied === g.id}
                onRename={(n) => rename(g.id, n)}
                onRegen={() => regen(g.id)}
                onGrant={() => grant(g.id)}
                onArchive={() => toggleArchive(g.id, !!g.archivedAt)}
                onCopyInvite={() => copyInvite(g.id)}
                onResetKie={() => resetKey(g.id, "kie")}
                onResetAnthropic={() => resetKey(g.id, "anthropic")}
                onDelete={() => removeGuest(g.id, g.name)}
              />
            ))}
          </div>
        )}

        {ownerPool && (
          <section className="rounded-xl border border-border bg-surface/50 p-5">
            <h2 className="font-semibold mb-3">Tu pool de créditos kie.ai</h2>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-foreground/60">Saldo kie.ai total</div>
                <div className="font-mono text-xl mt-1">{ownerPool.kieBalance == null ? "—" : Math.floor(ownerPool.kieBalance).toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-xs text-foreground/60">Reservado para invitados</div>
                <div className="font-mono text-xl mt-1">{Math.floor(ownerPool.reserved).toLocaleString()}</div>
              </div>
              <div className="rounded-lg border border-accent bg-accent/10 p-3">
                <div className="text-xs text-foreground/60">Disponible para asignar</div>
                <div className="font-mono text-xl mt-1 text-accent">{ownerPool.available == null ? "—" : Math.floor(ownerPool.available).toLocaleString()}</div>
              </div>
            </div>
          </section>
        )}

        {ownerTokens && (
          <section className="rounded-xl border border-border bg-surface/50 p-5">
            <h2 className="font-semibold mb-3">Owner Anthropic token spend</h2>
            <div className="text-sm">
              <div>Input: <span className="font-mono">{ownerTokens.inputTokens.toLocaleString()}</span></div>
              <div>Output: <span className="font-mono">{ownerTokens.outputTokens.toLocaleString()}</span></div>
              <div className="mt-1 font-semibold">≈ {fmtUsd(ownerTokens.estimatedUsd)}</div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function GuestCard({
  guest,
  copied,
  onRename,
  onRegen,
  onGrant,
  onArchive,
  onCopyInvite,
  onResetKie,
  onResetAnthropic,
  onDelete,
}: {
  guest: GuestSummary;
  copied: boolean;
  onRename: (name: string) => void;
  onRegen: () => void;
  onGrant: () => void;
  onArchive: () => void;
  onCopyInvite: () => void;
  onResetKie: () => void;
  onResetAnthropic: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(guest.name);
  const [kieBalance, setKieBalance] = useState<number | null | undefined>(undefined);
  const archived = !!guest.archivedAt;

  useEffect(() => {
    if (!guest.hasKieKey) {
      setKieBalance(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/guests/${guest.id}/kie-balance`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setKieBalance(data.balance ?? null);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [guest.id, guest.hasKieKey]);

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
            onClick={onCopyInvite}
            className="text-xs px-2 py-1 rounded border border-border"
          >
            {copied ? "Copied!" : "Copy invite link"}
          </button>
          <button
            onClick={onRegen}
            className="text-xs px-2 py-1 rounded border border-border"
          >
            Regenerate PIN
          </button>
          <button
            onClick={onGrant}
            className="text-xs px-2 py-1 rounded bg-accent text-white"
          >
            Add credits
          </button>
          {guest.hasKieKey && (
            <button
              onClick={onResetKie}
              className="text-xs px-2 py-1 rounded border border-border"
              title="Elimina la kie.ai key guardada del invitado"
            >
              Reset kie
            </button>
          )}
          {guest.hasAnthropicKey && (
            <button
              onClick={onResetAnthropic}
              className="text-xs px-2 py-1 rounded border border-border"
              title="Elimina la Anthropic key guardada del invitado"
            >
              Reset anthropic
            </button>
          )}
          <button
            onClick={onArchive}
            className="text-xs px-2 py-1 rounded border border-border"
          >
            {archived ? "Unarchive" : "Archive"}
          </button>
          <button
            onClick={onDelete}
            className="text-xs px-2 py-1 rounded border border-red-500/40 bg-red-500/10 text-red-400"
          >
            Eliminar
          </button>
        </div>
      </div>

      <div className="mb-3 text-xs flex gap-2 flex-wrap">
        {guest.hasKieKey ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-green-500/40 bg-green-500/10 text-green-500 px-2 py-0.5">
            ✓ kie.ai
            {kieBalance != null && (
              <span className="ml-1 font-mono text-foreground/80">
                · {Math.floor(kieBalance).toLocaleString()}
              </span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-foreground/20 bg-foreground/5 text-foreground/60 px-2 py-0.5">
            ✗ kie.ai
          </span>
        )}
        {guest.hasAnthropicKey ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-green-500/40 bg-green-500/10 text-green-500 px-2 py-0.5">
            ✓ Anthropic
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-foreground/20 bg-foreground/5 text-foreground/60 px-2 py-0.5">
            ✗ Anthropic
          </span>
        )}
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
