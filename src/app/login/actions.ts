"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

export type AuthFormState = { error?: string; message?: string; email?: string } | undefined;

function translateAuthError(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Email o contraseña incorrectos.";
    case "email_not_confirmed":
      return "Confirma tu email antes de iniciar sesión (revisa tu bandeja de entrada).";
    case "user_already_exists":
    case "email_exists":
      return "Ya existe una cuenta con este email.";
    case "weak_password":
      return "La contraseña es demasiado débil. Usa al menos 8 caracteres.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Demasiados intentos. Espera un momento y vuelve a probar.";
    case "signup_disabled":
      return "El registro de nuevas cuentas está desactivado.";
    default:
      return error.message || "Ha ocurrido un error. Inténtalo de nuevo.";
  }
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Introduce tu email y tu contraseña.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: translateAuthError(error), email };

  redirect(safeNextPath(formData.get("next")));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  if (!name || !email) return { error: "Introduce tu nombre y tu email.", email };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres.", email };

  const requestHeaders = await headers();
  const origin =
    requestHeaders.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: name },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: translateAuthError(error), email };

  // Si la confirmación por email está desactivada, ya hay sesión.
  if (data.session) redirect(next);

  return {
    email,
    message: `Te hemos enviado un enlace de confirmación a ${email}. Ábrelo para activar tu cuenta.`,
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
