"use client";

import { useEffect, useState } from "react";
import { Key, CheckCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TopBar } from "@/components/layout/TopBar";

export default function ApiKeysPage() {
  const [hasKey, setHasKey] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((me) => {
      setHasKey(!!me?.hasAnthropicKey);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anthropicKey: value.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error || "Error al guardar");
      return;
    }
    setSavedAt(new Date());
    setHasKey(!!value.trim());
    setValue("");
  };

  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-10">
          <div className="mb-8">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 border border-accent/20 px-2.5 py-0.5 rounded-full mb-3">
              <Key className="h-3 w-3" />
              API keys
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Conecta tus servicios</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configura las llaves que Agent Design necesita para operar en tu cuenta.
            </p>
          </div>

          {/* Anthropic API key */}
          <div className="rounded-2xl border border-border bg-surface p-6 mb-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  Anthropic API key
                  {hasKey && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-full">
                      <CheckCircle className="h-3 w-3" />
                      Conectada
                    </span>
                  )}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Necesaria para que el AI Co-Creator del chat funcione en tu workspace.
                </p>
              </div>
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent hover:underline inline-flex items-center gap-1"
              >
                Obtener key
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="space-y-3">
              <Input
                type="password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={hasKey ? "sk-ant-... (ya tienes una guardada — pega otra para reemplazar)" : "sk-ant-..."}
                className="font-mono text-xs"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              {savedAt && !error && (
                <p className="text-xs text-accent">✓ Guardada a las {savedAt.toLocaleTimeString()}</p>
              )}
              <div className="flex items-center gap-2">
                <Button variant="accent" onClick={save} disabled={saving || !value.trim()}>
                  {saving ? "Guardando..." : hasKey ? "Reemplazar key" : "Guardar key"}
                </Button>
                {hasKey && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await fetch("/api/me", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ anthropicKey: "" }),
                      });
                      setHasKey(false);
                      setSavedAt(new Date());
                    }}
                  >
                    Quitar
                  </Button>
                )}
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground/70 mt-4">
              🔒 Tu key nunca se muestra en la interfaz después de guardada. Solo se usa en
              tus llamadas al chat y se almacena en la base de datos.
            </p>
          </div>

          {/* Info: kie.ai is managed by the platform */}
          <div className="rounded-2xl border border-border bg-muted/30 p-6">
            <h2 className="font-semibold text-sm">Generación de imágenes (kie.ai)</h2>
            <p className="text-xs text-muted-foreground mt-1">
              La generación de imágenes está gestionada por Agent Design usando nuestra
              cuenta central. No necesitas configurar nada — solo asegúrate de tener
              créditos disponibles.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
