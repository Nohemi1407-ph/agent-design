"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Zap } from "lucide-react";

export default function InvitePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/invite/${id}`);
      if (cancelled) return;
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      const data = await res.json();
      if (data.ok) setName(data.name);
      else setNotFound(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length !== 6) {
      setError("Enter your 6-digit PIN.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/invite/${id}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        setError("Invalid PIN. Try again.");
        setLoading(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error.");
      setLoading(false);
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-2xl border border-border bg-surface/50 p-8 text-center">
          <h1 className="text-xl font-semibold mb-2">Invite not found</h1>
          <p className="text-sm text-foreground/60">
            Ask the owner for a new invite link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="max-w-sm w-full rounded-2xl border border-border bg-surface/50 p-8 space-y-6"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-xl bg-accent/15 border border-accent/40 flex items-center justify-center">
            <Zap className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">
              {name ? `Hi ${name}` : "Welcome"}
            </h1>
            <p className="text-sm text-foreground/60 mt-1">
              Enter your 6-digit PIN to continue.
            </p>
          </div>
        </div>

        <input
          autoFocus
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="••••••"
          className="w-full text-center font-mono tracking-[0.5em] text-3xl py-4 rounded-xl border-2 border-border bg-background outline-none focus:border-accent"
        />

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || pin.length !== 6}
          className="w-full rounded-xl bg-accent text-white py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Entering…" : "Enter"}
        </button>
      </form>
    </div>
  );
}
