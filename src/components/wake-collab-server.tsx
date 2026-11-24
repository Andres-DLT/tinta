"use client";

import { useEffect } from "react";
import { env } from "@/lib/env";

/**
 * En planes gratuitos (p. ej. Render Free) el servidor WebSocket se duerme
 * tras un rato sin uso y tarda ~1 min en arrancar. Lo despertamos en cuanto
 * alguien abre la web, para que esté listo cuando abra un documento.
 */
export function WakeCollabServer() {
  useEffect(() => {
    const healthUrl = `${env.collabUrl.replace(/^ws/, "http").replace(/\/+$/, "")}/health`;
    const controller = new AbortController();
    fetch(healthUrl, { signal: controller.signal, cache: "no-store" }).catch(() => {
      // Silencioso: si falla, y-websocket reintentará al abrir un documento.
    });
    return () => controller.abort();
  }, []);

  return null;
}
