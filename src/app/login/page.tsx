import { Zap, Sparkles } from "lucide-react";
import { signIn } from "@/auth";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-xl">Agent Design</span>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 border border-accent/20 px-2.5 py-0.5 rounded-full mb-3">
            <Sparkles className="h-3 w-3" />
            AI-powered
          </div>
          <h1 className="text-2xl font-bold">Entra a tu cuenta</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Te enviamos un enlace mágico a tu correo. Un click y estás dentro.
          </p>
        </div>

        <LoginForm searchParams={searchParams} />

        <p className="text-xs text-muted-foreground text-center mt-6">
          Sin contraseñas. Sin fricción. Solo tu correo.
        </p>
      </div>
    </div>
  );
}

async function LoginForm({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params.next || "/";
  const error = params.error;

  async function loginAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "").trim();
    if (!email) return;
    await signIn("resend", { email, redirectTo: next });
  }

  return (
    <form action={loginAction} className="space-y-3">
      <input
        type="email"
        name="email"
        placeholder="tu@correo.com"
        required
        autoFocus
        className="w-full h-12 px-4 rounded-xl border border-border bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors"
      />
      <button
        type="submit"
        className="w-full h-12 rounded-xl bg-accent text-accent-foreground font-semibold hover:bg-accent/90 shadow-lg shadow-accent/20 transition-colors"
      >
        Enviar enlace mágico →
      </button>
      {error && (
        <p className="text-xs text-destructive text-center">
          Algo salió mal. Intenta de nuevo.
        </p>
      )}
    </form>
  );
}
