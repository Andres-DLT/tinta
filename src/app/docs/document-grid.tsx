"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Eye, FileText, LogOut, Search, Trash2, Users } from "lucide-react";
import { Avatar, cn } from "@/components/ui";
import { RelativeTime } from "@/components/relative-time";
import type { DocumentRole } from "@/lib/collab/protocol";
import { deleteDocument, leaveDocument } from "./actions";

export interface DocumentSummary {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  role: DocumentRole;
  ownerName: string;
  ownerColor: string;
}

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "mine", label: "Míos" },
  { id: "shared", label: "Compartidos conmigo" },
] as const;

type Filter = (typeof FILTERS)[number]["id"];

const ROLE_LABEL: Record<DocumentRole, string> = {
  owner: "Propietario",
  editor: "Puede editar",
  viewer: "Solo lectura",
};

export function DocumentGrid({ documents }: { documents: DocumentSummary[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((doc) => {
      if (filter === "mine" && doc.role !== "owner") return false;
      if (filter === "shared" && doc.role === "owner") return false;
      if (!q) return true;
      return doc.title.toLowerCase().includes(q) || doc.preview.toLowerCase().includes(q);
    });
  }, [documents, filter, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1 text-sm">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                filter === f.id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="relative block sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <span className="sr-only">Buscar documentos</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título o contenido…"
            className="w-full rounded-lg border border-line bg-surface py-2 pr-3 pl-9 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState hasDocuments={documents.length > 0} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DocumentCard({ doc }: { doc: DocumentSummary }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isOwner = doc.role === "owner";
  const title = doc.title || "Documento sin título";

  const onRemove = () => {
    const question = isOwner
      ? `¿Eliminar «${title}» para todos? Esta acción no se puede deshacer.`
      : `¿Dejar de tener acceso a «${title}»?`;
    if (!window.confirm(question)) return;
    startTransition(async () => {
      const result = await (isOwner ? deleteDocument(doc.id) : leaveDocument(doc.id));
      if (result?.error) setError(result.error);
    });
  };

  return (
    <li
      className={cn(
        "group relative flex flex-col rounded-2xl border border-line bg-surface transition-shadow hover:shadow-lg hover:shadow-black/5",
        pending && "pointer-events-none opacity-50",
      )}
    >
      <Link href={`/docs/${doc.id}`} className="flex flex-1 flex-col p-5 focus-visible:outline-none">
        <span className="absolute inset-0 rounded-2xl group-focus-within:ring-2 group-focus-within:ring-brand" aria-hidden />
        <div className="mb-3 flex items-center gap-2 text-xs text-muted">
          <FileText className="size-4 text-brand" aria-hidden />
          <span>{ROLE_LABEL[doc.role]}</span>
          {doc.role === "viewer" && <Eye className="size-3.5" aria-hidden />}
        </div>
        <h3 className={cn("line-clamp-1 font-semibold", !doc.title && "text-muted italic")}>{title}</h3>
        <p className="mt-1.5 line-clamp-3 min-h-[3.75rem] text-sm leading-relaxed text-muted">
          {doc.preview || "Documento vacío"}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar name={doc.ownerName} color={doc.ownerColor} size="sm" />
            <span className="truncate">{isOwner ? "Tú" : doc.ownerName}</span>
            {!isOwner && <Users className="size-3.5 shrink-0" aria-label="Compartido contigo" />}
          </span>
          <span className="shrink-0">
            Editado <RelativeTime iso={doc.updatedAt} />
          </span>
        </div>
      </Link>

      <button
        type="button"
        onClick={onRemove}
        title={isOwner ? "Eliminar documento" : "Salir del documento"}
        className="absolute top-3 right-3 z-10 grid size-8 place-items-center rounded-lg text-muted opacity-0 transition hover:bg-danger/10 hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
      >
        {isOwner ? <Trash2 className="size-4" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
        <span className="sr-only">{isOwner ? "Eliminar documento" : "Salir del documento"}</span>
      </button>

      {error && <p className="px-5 pb-4 text-xs text-danger">{error}</p>}
    </li>
  );
}

function EmptyState({ hasDocuments }: { hasDocuments: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center">
      <FileText className="mx-auto mb-3 size-8 text-muted" aria-hidden />
      <p className="font-medium">{hasDocuments ? "Ningún documento coincide" : "Aún no tienes documentos"}</p>
      <p className="mt-1 text-sm text-muted">
        {hasDocuments
          ? "Prueba con otra búsqueda o filtro."
          : "Crea el primero y comparte el enlace con tu equipo."}
      </p>
    </div>
  );
}
