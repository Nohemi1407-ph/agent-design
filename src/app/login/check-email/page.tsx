import { Mail } from "lucide-react";

export default function CheckEmailPage() {
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-5">
          <Mail className="h-8 w-8 text-accent" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Revisa tu correo</h1>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Te enviamos un enlace mágico. Ábrelo desde este mismo navegador para
          entrar a Agent Design.
        </p>
        <p className="text-xs text-muted-foreground/70 mt-6">
          ¿No lo ves? Revisa spam o vuelve a{" "}
          <a href="/login" className="text-accent hover:underline">intentarlo</a>.
        </p>
      </div>
    </div>
  );
}
