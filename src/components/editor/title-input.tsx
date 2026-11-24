"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type * as Y from "yjs";
import { MAX_TITLE_LENGTH } from "@/lib/collab/protocol";

/**
 * Aplica a `ytext` el cambio mínimo (prefijo/sufijo comunes) que convierte
 * `prev` en `next`. Así, dos personas escribiendo a la vez en el título no se
 * pisan: Yjs fusiona inserciones y borrados por posición.
 */
export function applyTextDiff(ytext: Y.Text, prev: string, next: string) {
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--;
    endNext--;
  }
  ytext.doc?.transact(() => {
    if (endPrev > start) ytext.delete(start, endPrev - start);
    if (endNext > start) ytext.insert(start, next.slice(start, endNext));
  });
}

/** Ajusta una posición del cursor según los cambios remotos (delta de Yjs). */
export function transformPosition(position: number, delta: Y.YTextEvent["delta"]) {
  // `oldIndex` recorre el texto anterior al cambio (retain/delete avanzan en él).
  let oldIndex = 0;
  let result = position;
  for (const op of delta) {
    if (oldIndex >= position) break;
    if (op.retain) {
      oldIndex += op.retain;
    } else if (typeof op.insert === "string") {
      result += op.insert.length;
    } else if (op.delete) {
      result -= Math.min(op.delete, position - oldIndex);
      oldIndex += op.delete;
    }
  }
  return result;
}

export function TitleInput({
  ytext,
  readOnly,
  onEnter,
}: {
  ytext: Y.Text;
  readOnly: boolean;
  onEnter?: () => void;
}) {
  const [value, setValue] = useState(() => ytext.toString());
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);

  useEffect(() => {
    const onChange = (event: Y.YTextEvent, transaction: Y.Transaction) => {
      const input = inputRef.current;
      if (!transaction.local && input && document.activeElement === input) {
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? start;
        pendingSelection.current = [
          transformPosition(start, event.delta),
          transformPosition(end, event.delta),
        ];
      }
      setValue(ytext.toString());
    };
    ytext.observe(onChange);
    return () => ytext.unobserve(onChange);
  }, [ytext]);

  // Tras un cambio remoto, restauramos el cursor en su posición transformada.
  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    if (selection && inputRef.current) {
      inputRef.current.setSelectionRange(selection[0], selection[1]);
      pendingSelection.current = null;
    }
  }, [value]);

  // El título de la pestaña sigue al del documento.
  useEffect(() => {
    document.title = `${value.trim() || "Sin título"} · Tinta`;
  }, [value]);

  return (
    <input
      ref={inputRef}
      value={value}
      readOnly={readOnly}
      maxLength={MAX_TITLE_LENGTH}
      placeholder="Documento sin título"
      aria-label="Título del documento"
      spellCheck={false}
      onChange={(e) => {
        const next = e.target.value.slice(0, MAX_TITLE_LENGTH);
        applyTextDiff(ytext, ytext.toString(), next);
        setValue(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter?.();
        }
      }}
      className="w-full min-w-0 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-fg outline-none placeholder:text-muted/60 hover:border-line focus:border-brand read-only:hover:border-transparent"
    />
  );
}
