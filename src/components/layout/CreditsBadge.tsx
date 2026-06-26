"use client";

import { useEffect, useState, useCallback } from "react";
import { Coins, AlertTriangle } from "lucide-react";

interface CreditsState {
  balance: number | null;
  today: number;
  total: number;
  enabled: boolean;
}

const LOW_BALANCE_THRESHOLD = 50;

export function CreditsBadge() {
  const [state, setState] = useState<CreditsState | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/credits", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setState(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refresh();
    // Auto-refresh every 30s so it picks up generations from anywhere
    const id = setInterval(refresh, 30_000);
    // Also refresh on focus
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  if (!state?.enabled) return null;

  const low = state.balance !== null && state.balance < LOW_BALANCE_THRESHOLD;

  return (
    <div
      className={`hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs ${
        low
          ? "bg-destructive/10 border-destructive/30 text-destructive"
          : "bg-accent/10 border-accent/20 text-accent"
      }`}
      title={`Hoy: ${state.today.toFixed(1)} créditos · Total registrado: ${state.total.toFixed(1)}`}
    >
      {low ? (
        <AlertTriangle className="h-3.5 w-3.5" />
      ) : (
        <Coins className="h-3.5 w-3.5" />
      )}
      <span className="font-semibold tabular-nums">
        {state.balance !== null ? state.balance.toFixed(0) : "—"}
      </span>
      <span className="opacity-70">créditos</span>
      {state.today > 0 && (
        <span className="opacity-60 border-l border-current/20 pl-2 ml-1">
          −{state.today.toFixed(1)} hoy
        </span>
      )}
    </div>
  );
}
