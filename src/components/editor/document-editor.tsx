"use client";

import Link from "next/link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { Selection } from "@tiptap/pm/state";
import { ArrowLeft, Eye, RefreshCw } from "lucide-react";
import { Button, buttonStyles, cn } from "@/components/ui";
import {
  CONTENT_FIELD,
  TITLE_FIELD,
  canEdit,
  type DocumentRole,
  type LinkAccess,
  type PresenceUser,
} from "@/lib/collab/protocol";
import { ConnectionBadge } from "./connection-badge";
import { Presence } from "./presence";
import { ShareDialog } from "./share-dialog";
import { TitleInput } from "./title-input";
import { Toolbar } from "./toolbar";
import { useCollaboration, type CollaborationSession, type ConnectionStatus } from "./use-collaboration";

export interface DocumentEditorProps {
  documentId: string;
  role: DocumentRole;
  linkAccess: LinkAccess;
  user: PresenceUser;
}

export function DocumentEditor(props: DocumentEditorProps) {
  const { session, status, synced, fatal } = useCollaboration(props.documentId);

  if (fatal) {
    return (
      <CenteredMessage title="No se puede abrir el documento" text={fatal.message}>
        <Link href="/docs" className={cn(buttonStyles.base, buttonStyles.secondary)}>
          Volver a mis documentos
        </Link>
        <Button onClick={() => window.location.reload()}>
          <RefreshCw className="size-4" aria-hidden /> Reintentar
        </Button>
      </CenteredMessage>
    );
  }

  if (!session) return <EditorSkeleton />;
  return <Workspace {...props} session={session} status={status} synced={synced} />;
}

function Workspace({
  documentId,
  role,
  linkAccess,
  user,
  session,
  status,
  synced,
}: DocumentEditorProps & { session: CollaborationSession; status: ConnectionStatus; synced: boolean }) {
  const { doc, provider } = session;
  const editable = canEdit(role);

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable,
      extensions: [
        StarterKit.configure({
          // Yjs gestiona el historial (deshacer solo tus propios cambios).
          undoRedo: false,
          // Con varios clientes, TrailingNode añadiría párrafos duplicados.
          trailingNode: false,
          link: { openOnClick: !editable, autolink: true, defaultProtocol: "https" },
        }),
        Placeholder.configure({ placeholder: editable ? "Empieza a escribir…" : "" }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Collaboration.configure({ document: doc, field: CONTENT_FIELD }),
        CollaborationCaret.configure({ provider, user: { name: user.name, color: user.color } }),
      ],
      editorProps: {
        attributes: {
          class: "font-serif",
          "aria-label": "Contenido del documento",
          spellcheck: "true",
        },
      },
    },
    [doc, provider, editable],
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
          <Link
            href="/docs"
            title="Mis documentos"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
          >
            <ArrowLeft className="size-4" aria-hidden />
            <span className="sr-only">Volver a mis documentos</span>
          </Link>

          <div className="min-w-0 flex-1">
            <TitleInput
              ytext={doc.getText(TITLE_FIELD)}
              readOnly={!editable}
              onEnter={() => {
                if (!editor) return;
                // Síncrono (commands.focus espera a requestAnimationFrame y las
                // primeras teclas acabarían todavía en el título).
                editor.commands.setTextSelection(Selection.atStart(editor.state.doc).from);
                editor.view.focus();
              }}
            />
          </div>

          {!editable && (
            <span className="hidden items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted sm:inline-flex">
              <Eye className="size-3.5" aria-hidden /> Solo lectura
            </span>
          )}
          <ConnectionBadge status={status} synced={synced} />
          <Presence awareness={provider.awareness} self={user} />
          <ShareDialog documentId={documentId} role={role} selfId={user.id} initialLinkAccess={linkAccess} />
        </div>
        {editable && editor && (
          <div className="border-t border-line">
            <Toolbar editor={editor} />
          </div>
        )}
      </header>

      <main className="flex-1 px-3 py-6 sm:px-6 sm:py-10">
        <article
          className="mx-auto min-h-[70vh] w-full max-w-[52rem] cursor-text rounded-xl border border-line bg-surface px-6 py-10 shadow-sm sm:px-16 sm:py-14"
          onClick={(e) => {
            if (e.target === e.currentTarget) editor?.commands.focus("end");
          }}
        >
          {!synced && (
            <p className="mb-4 text-sm text-muted" role="status">
              Cargando contenido…
            </p>
          )}
          <EditorContent editor={editor} />
        </article>
      </main>
    </div>
  );
}

export function EditorSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy>
      <div className="flex h-14 items-center gap-3 border-b border-line bg-surface px-4">
        <div className="size-9 rounded-lg bg-surface-2" />
        <div className="h-6 w-56 animate-pulse rounded bg-surface-2" />
        <div className="ml-auto h-9 w-28 animate-pulse rounded-lg bg-surface-2" />
      </div>
      <div className="flex-1 px-6 py-10">
        <div className="mx-auto h-[70vh] max-w-[52rem] animate-pulse rounded-xl border border-line bg-surface" />
      </div>
    </div>
  );
}

export function CenteredMessage({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-muted">{text}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div>
      </div>
    </main>
  );
}
