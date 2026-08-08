"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, LogOut, User as UserIcon, Key } from "lucide-react";

interface Me {
  email?: string;
  name?: string | null;
  role?: "USER" | "ADMIN";
  hasAnthropicKey?: boolean;
}

export function UserMenu() {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {});
  }, []);

  if (!me?.email) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent hover:bg-accent/20 transition-colors"
        aria-label="User menu"
      >
        <UserIcon className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border bg-surface shadow-xl z-50 py-1">
            <div className="px-3 py-2 border-b border-border">
              <div className="text-xs font-semibold truncate">{me.name || me.email}</div>
              <div className="text-[10px] text-muted-foreground truncate">{me.email}</div>
              {me.role === "ADMIN" && (
                <span className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-medium text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded-full">
                  <Shield className="h-2.5 w-2.5" />
                  ADMIN
                </span>
              )}
            </div>

            <Link
              href="/settings/api-keys"
              className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
              onClick={() => setOpen(false)}
            >
              <Key className="h-3.5 w-3.5" />
              API keys {me.hasAnthropicKey ? "✓" : "(configurar)"}
            </Link>

            {me.role === "ADMIN" && (
              <Link
                href="/admin"
                className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
                onClick={() => setOpen(false)}
              >
                <Shield className="h-3.5 w-3.5" />
                Panel admin
              </Link>
            )}

            <form action="/api/auth/signout" method="POST" className="border-t border-border">
              <button
                type="submit"
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                Cerrar sesión
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
