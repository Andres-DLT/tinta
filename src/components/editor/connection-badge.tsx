"use client";

import { cn } from "@/components/ui";
import type { ConnectionStatus } from "./use-collaboration";

export function ConnectionBadge({ status, synced }: { status: ConnectionStatus; synced: boolean }) {
  const state =
    status === "connected" && synced
      ? {
          label: "En línea",
          dot: "bg-success",
          hint: "Conectado. Los cambios se sincronizan y se guardan automáticamente.",
        }
      : status === "disconnected"
        ? {
            label: "Sin conexión",
            dot: "bg-danger",
            hint: "Puedes seguir escribiendo: tus cambios se enviarán al reconectar.",
          }
        : { label: "Conectando…", dot: "bg-warning animate-pulse", hint: "Conectando con el servidor…" };

  return (
    <span
      role="status"
      title={state.hint}
      className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium whitespace-nowrap text-muted md:inline-flex"
    >
      <span className={cn("size-2 rounded-full", state.dot)} aria-hidden />
      {state.label}
    </span>
  );
}
