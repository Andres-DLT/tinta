"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { signIn, signUp } from "./actions";

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/docs";
  const callbackError = searchParams.get("error");
  const [mode, setMode] = useState<"signin" | "signup">(
    searchParams.get("mode") === "signup" ? "signup" : "signin",
  );

  const [signInState, signInAction, signingIn] = useActionState(signIn, undefined);
  const [signUpState, signUpAction, signingUp] = useActionState(signUp, undefined);

  const isSignUp = mode === "signup";
  const state = isSignUp ? signUpState : signInState;
  const pending = isSignUp ? signingUp : signingIn;

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div className="mb-6 grid grid-cols-2 rounded-lg bg-surface-2 p-1 text-sm font-medium" role="tablist">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded-md py-1.5 transition-colors",
              mode === m ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
            )}
          >
            {m === "signin" ? "Iniciar sesión" : "Crear cuenta"}
          </button>
        ))}
      </div>

      <form action={isSignUp ? signUpAction : signInAction} className="space-y-4" key={mode}>
        <input type="hidden" name="next" value={next} />

        {isSignUp && (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Nombre</span>
            <input name="name" required maxLength={80} autoComplete="name" placeholder="Ada Lovelace" className={inputClass} />
          </label>
        )}

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="tu@email.com"
            defaultValue={state?.email}
            className={inputClass}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Contraseña</span>
          <input
            name="password"
            type="password"
            required
            minLength={isSignUp ? 8 : undefined}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            placeholder={isSignUp ? "Mínimo 8 caracteres" : "••••••••"}
            className={inputClass}
          />
        </label>

        {(state?.error || (callbackError && !state)) && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {state?.error ?? "El enlace de confirmación no es válido o ha caducado."}
          </p>
        )}
        {state?.message && (
          <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
            {state.message}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full py-2.5">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {isSignUp ? "Crear cuenta" : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
