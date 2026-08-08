"use client";

import { useEffect, useState, useCallback } from "react";
import { Coins, Users, Search, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TopBar } from "@/components/layout/TopBar";

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
  createdAt: string;
  carouselCount: number;
  balance: number;
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [grantOpen, setGrantOpen] = useState<AdminUser | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json();
    setUsers(data.users || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = users.filter(
    (u) =>
      !query ||
      u.email.toLowerCase().includes(query.toLowerCase()) ||
      (u.name || "").toLowerCase().includes(query.toLowerCase())
  );

  const totalUsers = users.length;
  const totalCredits = users.reduce((s, u) => s + u.balance, 0);
  const totalCarousels = users.reduce((s, u) => s + u.carouselCount, 0);

  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="mb-8">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 border border-accent/20 px-2.5 py-0.5 rounded-full mb-3">
              <Users className="h-3 w-3" />
              Admin panel
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestiona créditos, ve la actividad y controla la plataforma.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <StatCard label="Usuarios totales" value={totalUsers.toString()} />
            <StatCard label="Créditos en circulación" value={totalCredits.toLocaleString()} icon={<Coins className="h-4 w-4" />} />
            <StatCard label="Carruseles creados" value={totalCarousels.toString()} />
          </div>

          {/* Search */}
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por email o nombre..."
              className="pl-9"
            />
          </div>

          {/* Users table */}
          <div className="rounded-2xl border border-border bg-surface overflow-hidden">
            {loading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Cargando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Sin usuarios</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Usuario</th>
                    <th className="text-left px-4 py-3 font-medium">Rol</th>
                    <th className="text-right px-4 py-3 font-medium">Créditos</th>
                    <th className="text-right px-4 py-3 font-medium">Carruseles</th>
                    <th className="text-right px-4 py-3 font-medium">Alta</th>
                    <th className="text-right px-4 py-3 font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <div className="font-medium">{u.name || u.email.split("@")[0]}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${u.role === "ADMIN" ? "bg-accent/10 text-accent border border-accent/20" : "bg-muted text-muted-foreground"}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {u.balance.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{u.carouselCount}</td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => setGrantOpen(u)}>
                          <Coins className="h-3.5 w-3.5" />
                          Créditos
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      {grantOpen && (
        <GrantCreditsDialog
          user={grantOpen}
          onClose={() => setGrantOpen(null)}
          onSaved={() => {
            setGrantOpen(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function GrantCreditsDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (mode: "add" | "remove") => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Ingresa un número mayor que 0");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: mode === "add" ? n : -n,
          reason,
          type: mode === "add" ? "GRANT" : "ADJUSTMENT",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Error al guardar");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-border shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold">Ajustar créditos</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {user.email} · Balance actual: <span className="font-semibold text-foreground">{user.balance.toLocaleString()}</span>
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Cantidad</label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
              autoFocus
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Motivo (opcional)</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Compra manual, promo, ajuste..."
              className="mt-1"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex items-center gap-2 mt-5">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button variant="outline" onClick={() => submit("remove")} disabled={saving} className="flex-1">
            <Minus className="h-4 w-4" /> Quitar
          </Button>
          <Button variant="accent" onClick={() => submit("add")} disabled={saving} className="flex-1">
            <Plus className="h-4 w-4" /> Añadir
          </Button>
        </div>
      </div>
    </div>
  );
}
