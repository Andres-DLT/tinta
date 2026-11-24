"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Globe, Loader2, Lock, Share2, X } from "lucide-react";
import { Avatar, Button, cn } from "@/components/ui";
import type { DocumentRole, LinkAccess } from "@/lib/collab/protocol";
import { createClient } from "@/lib/supabase/client";

interface Member {
  userId: string;
  role: DocumentRole;
  name: string;
  email: string;
  color: string;
}

const ROLE_LABEL: Record<DocumentRole, string> = {
  owner: "Propietario",
  editor: "Editor",
  viewer: "Lector",
};

const LINK_LABEL: Record<LinkAccess, string> = {
  none: "Solo personas invitadas",
  view: "Cualquiera con el enlace puede ver",
  edit: "Cualquiera con el enlace puede editar",
};

function rpcErrorMessage(message: string) {
  if (message.includes("user_not_found"))
    return "No hay ninguna cuenta con ese email. Pídele que se registre primero.";
  if (message.includes("cannot_invite_self")) return "Ya eres el propietario de este documento.";
  if (message.includes("not_owner")) return "Solo el propietario puede invitar.";
  return "No se pudo completar la acción.";
}

const selectClass =
  "rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-fg focus:border-brand focus:outline-none disabled:opacity-60";

export function ShareDialog({
  documentId,
  role,
  selfId,
  initialLinkAccess,
}: {
  documentId: string;
  role: DocumentRole;
  selfId: string;
  initialLinkAccess: LinkAccess;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const isOwner = role === "owner";

  const [members, setMembers] = useState<Member[] | null>(null);
  const [linkAccess, setLinkAccess] = useState<LinkAccess>(initialLinkAccess);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const loadMembers = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("document_members")
      .select("user_id, role, profiles(display_name, email, color)")
      .eq("document_id", documentId);
    if (loadError) {
      setError("No se pudo cargar la lista de personas.");
      return;
    }
    const order: Record<DocumentRole, number> = { owner: 0, editor: 1, viewer: 2 };
    setMembers(
      (data ?? [])
        .map((m) => ({
          userId: m.user_id,
          role: m.role,
          name: m.profiles?.display_name ?? "Usuario",
          email: m.profiles?.email ?? "",
          color: m.profiles?.color ?? "#64748b",
        }))
        .sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name)),
    );
  }, [supabase, documentId]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const open = () => {
    setError(null);
    dialogRef.current?.showModal();
    void loadMembers();
  };

  const run = (action: () => Promise<string | null>) => {
    setError(null);
    startTransition(async () => {
      const failure = await action();
      if (failure) setError(failure);
      await loadMembers();
    });
  };

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    const target = email.trim();
    if (!target) return;
    run(async () => {
      const { error: rpcError } = await supabase.rpc("add_document_member", {
        p_document_id: documentId,
        p_email: target,
        p_role: inviteRole,
      });
      if (rpcError) return rpcErrorMessage(rpcError.message);
      setEmail("");
      return null;
    });
  };

  const changeRole = (userId: string, newRole: DocumentRole) =>
    run(async () => {
      const { error: updateError } = await supabase
        .from("document_members")
        .update({ role: newRole })
        .eq("document_id", documentId)
        .eq("user_id", userId);
      return updateError ? "No se pudo cambiar el rol." : null;
    });

  const removeMember = (userId: string) =>
    run(async () => {
      const { error: deleteError } = await supabase
        .from("document_members")
        .delete()
        .eq("document_id", documentId)
        .eq("user_id", userId);
      if (deleteError) return "No se pudo quitar el acceso.";
      if (userId === selfId) router.push("/docs");
      return null;
    });

  const changeLinkAccess = (value: LinkAccess) =>
    run(async () => {
      const previous = linkAccess;
      setLinkAccess(value);
      const { error: updateError } = await supabase
        .from("documents")
        .update({ link_access: value })
        .eq("id", documentId);
      if (updateError) {
        setLinkAccess(previous);
        return "No se pudo cambiar el acceso por enlace.";
      }
      return null;
    });

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/docs/${documentId}`);
    setCopied(true);
  };

  return (
    <>
      <Button onClick={open} className="shrink-0">
        <Share2 className="size-4" aria-hidden />
        <span className="hidden sm:inline">Compartir</span>
      </Button>

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current.close();
        }}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">Compartir documento</h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">Cerrar</span>
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          {isOwner && (
            <form onSubmit={invite} className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email de la persona"
                aria-label="Email de la persona a invitar"
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
              />
              <div className="flex gap-2">
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}
                  aria-label="Rol"
                  className={selectClass}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Lector</option>
                </select>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  Invitar
                </Button>
              </div>
            </form>
          )}

          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          <section>
            <h3 className="mb-2 text-sm font-medium text-muted">Personas con acceso</h3>
            {members === null ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-11 animate-pulse rounded-lg bg-surface-2" />
                ))}
              </div>
            ) : (
              <ul className={cn("max-h-64 space-y-1 overflow-y-auto", pending && "opacity-70")}>
                {members.map((m) => (
                  <li key={m.userId} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                    <Avatar name={m.name} color={m.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {m.name} {m.userId === selfId && <span className="font-normal text-muted">(tú)</span>}
                      </p>
                      <p className="truncate text-xs text-muted">{m.email}</p>
                    </div>
                    {isOwner && m.role !== "owner" ? (
                      <div className="flex items-center gap-1">
                        <select
                          value={m.role}
                          disabled={pending}
                          onChange={(e) => changeRole(m.userId, e.target.value as DocumentRole)}
                          aria-label={`Rol de ${m.name}`}
                          className={selectClass}
                        >
                          <option value="editor">Editor</option>
                          <option value="viewer">Lector</option>
                        </select>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => removeMember(m.userId)}
                          title="Quitar acceso"
                          className="grid size-8 place-items-center rounded-md text-muted hover:bg-danger/10 hover:text-danger"
                        >
                          <X className="size-4" aria-hidden />
                          <span className="sr-only">Quitar acceso a {m.name}</span>
                        </button>
                      </div>
                    ) : !isOwner && m.userId === selfId ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => removeMember(m.userId)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                      >
                        Salir
                      </button>
                    ) : (
                      <span className="text-xs text-muted">{ROLE_LABEL[m.role]}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl bg-surface-2 p-4">
            <h3 className="mb-3 text-sm font-medium">Acceso mediante enlace</h3>
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-muted">
                {linkAccess === "none" ? <Lock className="size-4" aria-hidden /> : <Globe className="size-4" aria-hidden />}
              </span>
              {isOwner ? (
                <select
                  value={linkAccess}
                  disabled={pending}
                  onChange={(e) => changeLinkAccess(e.target.value as LinkAccess)}
                  aria-label="Acceso mediante enlace"
                  className={cn(selectClass, "min-w-0 flex-1")}
                >
                  {(Object.keys(LINK_LABEL) as LinkAccess[]).map((value) => (
                    <option key={value} value={value}>
                      {LINK_LABEL[value]}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="flex-1 text-sm text-muted">{LINK_LABEL[linkAccess]}</p>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">
              Hace falta tener una cuenta para abrir el enlace. Quien lo abra se añadirá a la lista.
            </p>
          </section>
        </div>

        <div className="flex justify-end border-t border-line px-5 py-4">
          <Button variant="secondary" onClick={copyLink}>
            {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Enlace copiado" : "Copiar enlace"}
          </Button>
        </div>
      </dialog>
    </>
  );
}
