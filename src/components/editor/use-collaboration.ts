"use client";

import { useEffect, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { CloseCode } from "@/lib/collab/protocol";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface CollaborationSession {
  doc: Y.Doc;
  provider: WebsocketProvider;
}

export interface FatalError {
  code: number;
  message: string;
}

const MAX_AUTH_RETRIES = 3;

function describeClose(code: number): string {
  switch (code) {
    case CloseCode.Unauthorized:
      return "Tu sesión ha caducado. Vuelve a iniciar sesión para seguir editando.";
    case CloseCode.Forbidden:
      return "Ya no tienes acceso a este documento.";
    case CloseCode.NotFound:
      return "Este documento ya no existe.";
    case CloseCode.PermissionsChanged:
      return "Tus permisos en este documento han cambiado. Recarga la página para continuar.";
    default:
      return "Se ha perdido la conexión con el servidor de colaboración.";
  }
}

/**
 * Crea el Y.Doc local y la conexión WebSocket con el servidor de colaboración.
 *
 * - Autentica con el access token de Supabase (query param `token`).
 * - Mantiene el token actualizado cuando Supabase lo rota.
 * - Si el servidor cierra con 4401 (token caducado), refresca y reconecta.
 * - y-websocket reconecta solo (con backoff) ante cortes de red; al volver,
 *   el protocolo de sincronización envía los cambios hechos sin conexión.
 */
export function useCollaboration(documentId: string) {
  const [session, setSession] = useState<CollaborationSession | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [synced, setSynced] = useState(false);
  const [fatal, setFatal] = useState<FatalError | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(env.collabUrl, documentId, doc, { connect: false });
    let cancelled = false;
    let authRetries = 0;

    const setToken = (token: string | undefined) => {
      // `provider.url` se recalcula en cada (re)conexión a partir de `params`.
      provider.params = { token: token ?? "" };
    };

    provider.on("status", ({ status }) => setStatus(status));
    provider.on("sync", (isSynced: boolean) => {
      setSynced(isSynced);
      if (isSynced) authRetries = 0;
    });
    provider.on("closed", async ({ code }) => {
      if (code === CloseCode.Unauthorized && authRetries < MAX_AUTH_RETRIES) {
        authRetries++;
        const { data } = await supabase.auth.refreshSession();
        if (cancelled) return;
        if (data.session) {
          setToken(data.session.access_token);
          provider.connect();
          return;
        }
      }
      if (!cancelled) setFatal({ code, message: describeClose(code) });
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (newSession?.access_token) setToken(newSession.access_token);
      if (event === "SIGNED_OUT") {
        provider.disconnect();
        setFatal({ code: CloseCode.Unauthorized, message: describeClose(CloseCode.Unauthorized) });
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setToken(data.session?.access_token);
      provider.connect();
      setSession({ doc, provider });
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
      provider.destroy();
      // y-websocket no destruye el Awareness (tiene su propio setInterval).
      provider.awareness.destroy();
      doc.destroy();
    };
  }, [documentId]);

  return { session, status, synced, fatal };
}
