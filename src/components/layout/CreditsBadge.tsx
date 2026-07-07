"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const refresh = async () => {
      try {
        const res = await fetch("/api/credits", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setState(data);
      } catch (err) {
        // Silently ignore aborts and network errors so the dev overlay doesn't pop
        if ((err as Error)?.name !== "AbortError") {
          // truly unexpected — keep silent, badge will just stay stale
        }
      }
    };

    refresh();
    const id = setInterval(refresh, 30_000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      try {
        controller.abort(new DOMException("CreditsBadge unmounted", "AbortError"));
      } catch {
        // ignore — abort can only fail if already aborted
      }
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

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
