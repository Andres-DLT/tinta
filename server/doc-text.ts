import * as Y from "yjs";
import {
  CONTENT_FIELD,
  MAX_PREVIEW_LENGTH,
  MAX_TITLE_LENGTH,
  TITLE_FIELD,
} from "../src/lib/collab/protocol";

/** Convierte un fragmento Yjs (estructura ProseMirror) a texto plano. */
function xmlToText(node: Y.XmlFragment | Y.XmlElement): string {
  const parts: string[] = [];
  node.forEach((child) => {
    if (child instanceof Y.XmlText) {
      const delta = child.toDelta() as Array<{ insert: unknown }>;
      parts.push(
        delta.map((op) => (typeof op.insert === "string" ? op.insert : "")).join(""),
      );
    } else if (child instanceof Y.XmlElement) {
      // Cada elemento de bloque (párrafo, título, item de lista…) en su línea.
      parts.push(xmlToText(child));
    }
  });
  return parts.filter(Boolean).join("\n");
}

export function getTitle(doc: Y.Doc): string {
  return doc.getText(TITLE_FIELD).toString().trim().slice(0, MAX_TITLE_LENGTH);
}

export function getPlainText(doc: Y.Doc): string {
  return xmlToText(doc.getXmlFragment(CONTENT_FIELD));
}

/** Texto corto para la lista de documentos. */
export function getPreview(doc: Y.Doc): string {
  return getPlainText(doc).replace(/\s+/g, " ").trim().slice(0, MAX_PREVIEW_LENGTH);
}
