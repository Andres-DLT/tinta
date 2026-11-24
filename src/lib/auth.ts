import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  color: string;
}

/**
 * Capa de acceso a datos: devuelve el usuario autenticado (o redirige a /login).
 * `cache` de React deduplica la llamada dentro de una misma petición.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, display_name, color")
    .eq("id", userId)
    .maybeSingle();

  return {
    id: userId,
    email: profile?.email ?? String(data.claims.email ?? ""),
    name: profile?.display_name ?? String(data.claims.email ?? "Usuario"),
    color: profile?.color ?? "#2563eb",
  };
});
