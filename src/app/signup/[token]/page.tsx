"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Zap } from "lucide-react";

export default function SignupPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [valid, setValid] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/signup/${token}`);
      if (cancelled) return;
      setValid(res.ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Ingresa tu nombre.");
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setError("El PIN debe tener 6 dígitos.");
      return;
    }
    if (pin !== pin2) {
      setError("Los PIN no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/signup/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudo registrar.");
        setLoading(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Error de red.");
      setLoading(false);
    }
  }

  if (valid === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-2xl border border-border bg-surface/50 p-8 text-center">
          <h1 className="text-xl font-semibold mb-2">Invitación no válida o expirada</h1>
          <p className="text-sm text-foreground/60">Pide al administrador un nuevo enlace.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-2xl border border-accent bg-accent/10 p-8 text-center">
          <h1 className="text-xl font-semibold mb-2">Registro recibido</h1>
          <p className="text-sm text-foreground/70">Esperando aprobación del administrador.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="max-w-sm w-full rounded-2xl border border-border bg-surface/50 p-8 space-y-5"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-xl bg-accent/15 border border-accent/40 flex items-center justify-center">
            <Zap className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Crear cuenta</h1>
            <p className="text-sm text-foreground/60 mt-1">
              Elige un PIN de 6 dígitos. Tendrás que esperar aprobación del administrador.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-foreground/70">Nombre</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-foreground/70">PIN (6 dígitos)</label>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full text-center font-mono tracking-[0.5em] text-2xl py-3 rounded-lg border border-border bg-background outline-none focus:border-accent"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-foreground/70">Confirma el PIN</label>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full text-center font-mono tracking-[0.5em] text-2xl py-3 rounded-lg border border-border bg-background outline-none focus:border-accent"
          />
        </div>

        {error && <p className="text-sm text-red-400 text-center">{error}</p>}

        <button
          type="submit"
          disabled={loading || valid === null}
          className="w-full rounded-xl bg-accent text-white py-3 text-sm font-semibold disabled:opacity-50"
        >
          {loading ? "Enviando…" : "Registrarme"}
        </button>
      </form>
    </div>
  );
}
