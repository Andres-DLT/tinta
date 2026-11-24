"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Supabase Realtime: cuando cambia un documento visible para el usuario
 * (título, vista previa, acceso) o le comparten/quitan uno, refresca la lista.
 * Realtime aplica las políticas RLS a cada suscriptor.
 */
export function RealtimeRefresh({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    const channel = supabase
      .channel(`dashboard:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, refresh)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "document_members", filter: `user_id=eq.${userId}` },
        refresh,
      )
      .subscribe();

    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [router, userId]);

  return null;
}
