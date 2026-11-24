"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/components/ui";

function ToolbarButton({
  icon: Icon,
  label,
  shortcut,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Evita que el botón robe el foco (y la selección) al editor.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md transition-colors disabled:opacity-35",
        active ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />;

export function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      paragraph: e.isActive("paragraph"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      taskList: e.isActive("taskList"),
      blockquote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();
  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

  const toggleLink = () => {
    if (s.link) {
      chain().extendMarkRange("link").unsetLink().run();
      return;
    }
    const url = window.prompt("Dirección del enlace", "https://");
    if (!url || url === "https://") return;
    chain().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div
      role="toolbar"
      aria-label="Formato"
      className="flex items-center gap-0.5 overflow-x-auto px-3 py-1.5 [scrollbar-width:none]"
    >
      <ToolbarButton icon={Undo2} label="Deshacer" shortcut={`${mod}+Z`} disabled={!s.canUndo} onClick={() => chain().undo().run()} />
      <ToolbarButton icon={Redo2} label="Rehacer" shortcut={`${mod}+Shift+Z`} disabled={!s.canRedo} onClick={() => chain().redo().run()} />
      <Divider />
      <ToolbarButton icon={Pilcrow} label="Texto normal" active={s.paragraph} onClick={() => chain().setParagraph().run()} />
      <ToolbarButton icon={Heading1} label="Título 1" active={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()} />
      <ToolbarButton icon={Heading2} label="Título 2" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
      <ToolbarButton icon={Heading3} label="Título 3" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
      <Divider />
      <ToolbarButton icon={Bold} label="Negrita" shortcut={`${mod}+B`} active={s.bold} onClick={() => chain().toggleBold().run()} />
      <ToolbarButton icon={Italic} label="Cursiva" shortcut={`${mod}+I`} active={s.italic} onClick={() => chain().toggleItalic().run()} />
      <ToolbarButton icon={Underline} label="Subrayado" shortcut={`${mod}+U`} active={s.underline} onClick={() => chain().toggleUnderline().run()} />
      <ToolbarButton icon={Strikethrough} label="Tachado" active={s.strike} onClick={() => chain().toggleStrike().run()} />
      <ToolbarButton icon={Code} label="Código en línea" active={s.code} onClick={() => chain().toggleCode().run()} />
      <ToolbarButton icon={Link2} label={s.link ? "Quitar enlace" : "Insertar enlace"} active={s.link} onClick={toggleLink} />
      <Divider />
      <ToolbarButton icon={List} label="Lista con viñetas" active={s.bulletList} onClick={() => chain().toggleBulletList().run()} />
      <ToolbarButton icon={ListOrdered} label="Lista numerada" active={s.orderedList} onClick={() => chain().toggleOrderedList().run()} />
      <ToolbarButton icon={ListChecks} label="Lista de tareas" active={s.taskList} onClick={() => chain().toggleTaskList().run()} />
      <Divider />
      <ToolbarButton icon={Quote} label="Cita" active={s.blockquote} onClick={() => chain().toggleBlockquote().run()} />
      <ToolbarButton icon={Code2} label="Bloque de código" active={s.codeBlock} onClick={() => chain().toggleCodeBlock().run()} />
      <ToolbarButton icon={Minus} label="Línea horizontal" onClick={() => chain().setHorizontalRule().run()} />
    </div>
  );
}
