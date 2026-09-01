"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, LogIn, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/modules/admin/login-action";

/**
 * Anmeldeformular des Adminbereichs.
 *
 * Bewusst ohne react-hook-form: zwei Felder, keine clientseitige Validierung
 * nötig. Die Prüfung passiert ohnehin am Server – alles andere wäre nur
 * Scheinsicherheit.
 */
export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      const result = await loginAction({
        email: formData.get("email"),
        password: formData.get("password"),
        callbackUrl,
      });

      if (!result.ok) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      // refresh() lädt das Server-Layout neu, damit die frische Session
      // sofort greift.
      router.replace(result.data.redirectTo);
      router.refresh();
    } catch {
      setError(
        "Die Verbindung zum Server ist abgebrochen. Bitte versuchen Sie es erneut.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/8 flex gap-3 rounded-lg border p-3.5 text-sm"
        >
          <TriangleAlert
            className="text-destructive mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <p>{error}</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="login-email">E-Mail</Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          required
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="login-password">Passwort</Label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <Button
        type="submit"
        variant="brand"
        size="2xl"
        className="w-full"
        disabled={submitting}
      >
        {submitting ? (
          <Loader2
            data-icon="inline-start"
            className="animate-spin"
            aria-hidden="true"
          />
        ) : (
          <LogIn data-icon="inline-start" aria-hidden="true" />
        )}
        {submitting ? "Anmeldung läuft …" : "Anmelden"}
      </Button>
    </form>
  );
}
