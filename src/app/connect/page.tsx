"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";

export default function ConnectPage() {
  const router = useRouter();
  const [kieKey, setKieKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const kie = kieKey.trim();
    const anthropic = anthropicKey.trim();
    if (!kie || !anthropic) {
      setError("Pega ambas API keys.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/me/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kieApiKey: kie, anthropicApiKey: anthropic }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "No se pudieron validar las keys.");
        setLoading(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Error de red.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-border bg-surface/60 backdrop-blur-sm p-8 shadow-xl space-y-5"
      >
        <div className="flex flex-col items-center">
          <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center mb-3">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-semibold">Conecta tus API keys</h1>
          <p className="text-sm text-foreground/60 mt-1 text-center">
            kie.ai se usará para generar imágenes; Anthropic para el chat.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-foreground/70">kie.ai API key (imágenes)</label>
          <input
            autoFocus
            type="password"
            value={kieKey}
            onChange={(e) => setKieKey(e.target.value)}
            placeholder="sk-..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-foreground/70">Clave Anthropic (para el chat)</label>
          <input
            type="password"
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            placeholder="sk-ant-..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-accent text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Validando…" : "Conectar"}
        </button>

        <div className="text-xs text-foreground/60 text-center space-y-1">
          <div>
            ¿No tienes cuenta kie.ai?{" "}
            <a href="https://kie.ai" target="_blank" rel="noreferrer" className="text-accent underline">
              Regístrate
            </a>
          </div>
          <div>
            ¿No tienes clave Anthropic?{" "}
            <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer" className="text-accent underline">
              Consíguela aquí
            </a>
          </div>
        </div>
      </form>
    </div>
  );
}
