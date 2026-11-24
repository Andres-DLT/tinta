/**
 * Tests de integración del servidor de colaboración.
 * Usan clientes y-websocket reales contra el servidor, con autorización y
 * persistencia en memoria (sin Supabase).
 *
 *   npm test
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { createCollabServer, type CollabServer } from "../server/collab-server";
import { getPreview, getTitle } from "../server/doc-text";
import { CollabError, type DocumentSnapshot, type Logger } from "../server/types";
import { CloseCode, CONTENT_FIELD, TITLE_FIELD, type DocumentRole } from "../src/lib/collab/protocol";

const DOC = "11111111-1111-4111-8111-111111111111";
const DOC_PRIVATE = "22222222-2222-4222-8222-222222222222";
const DOC_MISSING = "33333333-3333-4333-8333-333333333333";

const users = {
  alice: { id: "a", name: "Alice", color: "#e11d48" },
  carol: { id: "c", name: "Carol", color: "#059669" },
  bob: { id: "b", name: "Bob", color: "#2563eb" },
};

const members: Record<string, Record<string, DocumentRole>> = {
  [DOC]: { a: "owner", c: "editor", b: "viewer" },
  [DOC_PRIVATE]: { a: "owner" },
};

const stored = new Map<string, { state: Uint8Array | null }>([
  [DOC, { state: null }],
  [DOC_PRIVATE, { state: null }],
]);
const saves: Array<{ id: string } & DocumentSnapshot> = [];

const silentLogger: Logger = { info() {}, warn() {}, error() {} };

let server: CollabServer;
let url: string;
const providers: WebsocketProvider[] = [];

before(async () => {
  server = createCollabServer({
    logger: silentLogger,
    room: { saveDebounceMs: 50, saveMaxWaitMs: 200 },
    authorize: async (token, documentId) => {
      // token de prueba: "user:<id>"
      const userId = token?.startsWith("user:") ? token.slice(5) : null;
      const user = Object.values(users).find((u) => u.id === userId);
      if (!user) throw new CollabError(CloseCode.Unauthorized, "token inválido");
      if (!stored.has(documentId)) throw new CollabError(CloseCode.NotFound, "no existe");
      const role = members[documentId]?.[user.id];
      if (!role) throw new CollabError(CloseCode.Forbidden, "sin acceso");
      return { user, role };
    },
    persistence: {
      async load(id) {
        return stored.get(id) ?? null;
      },
      async save(id, snapshot) {
        saves.push({ id, ...snapshot });
        const entry = stored.get(id);
        if (!entry) return false;
        entry.state = snapshot.state;
        return true;
      },
    },
    getRoles: async (documentId) => {
      if (!stored.has(documentId)) return null;
      return new Map(Object.entries(members[documentId] ?? {}));
    },
    permissionsCheckIntervalMs: 50,
  });
  const port = await server.listen(0, "127.0.0.1");
  url = `ws://127.0.0.1:${port}`;
});

after(async () => {
  for (const p of providers) disconnect(p);
  await server.close();
});

/** y-websocket no destruye el Awareness (tiene un setInterval propio). */
function disconnect(provider: WebsocketProvider) {
  provider.destroy();
  provider.awareness.destroy();
}

function connect(token: string, docId = DOC) {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(url, docId, doc, {
    params: { token },
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
    disableBc: true,
  });
  providers.push(provider);
  return { doc, provider };
}

async function waitFor(check: () => boolean, label: string, timeoutMs = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timeout esperando: ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

function waitForClose(provider: WebsocketProvider) {
  return new Promise<{ code: number; reason: string }>((resolve) => {
    provider.once("closed", (event) => resolve(event));
  });
}

const text = (doc: Y.Doc) => doc.getText(TITLE_FIELD).toString();

function writeParagraph(doc: Y.Doc, content: string) {
  const paragraph = new Y.XmlElement("paragraph");
  paragraph.insert(0, [new Y.XmlText(content)]);
  const fragment = doc.getXmlFragment(CONTENT_FIELD);
  fragment.insert(fragment.length, [paragraph]);
}

describe("servidor de colaboración", () => {
  test("sincroniza ediciones entre dos clientes en tiempo real", async () => {
    const a = connect("user:a");
    const c = connect("user:c");
    await waitFor(() => a.provider.synced && c.provider.synced, "sync inicial");

    a.doc.getText(TITLE_FIELD).insert(0, "Plan de lanzamiento");
    writeParagraph(a.doc, "Hola desde Alice");
    await waitFor(() => text(c.doc) === "Plan de lanzamiento", "título en Carol");
    await waitFor(() => getPreview(c.doc) === "Hola desde Alice", "contenido en Carol");

    writeParagraph(c.doc, "Respuesta de Carol");
    await waitFor(() => getPreview(a.doc) === "Hola desde Alice Respuesta de Carol", "contenido en Alice");

    disconnect(a.provider);
    disconnect(c.provider);
  });

  test("las ediciones concurrentes convergen al mismo resultado", async () => {
    const a = connect("user:a");
    const c = connect("user:c");
    await waitFor(() => a.provider.synced && c.provider.synced, "sync inicial");

    const before = text(a.doc);
    // Ambos escriben a la vez en la misma posición, sin esperar al otro.
    a.doc.getText(TITLE_FIELD).insert(0, "[A]");
    c.doc.getText(TITLE_FIELD).insert(0, "[C]");
    await waitFor(
      () => text(a.doc) === text(c.doc) && text(a.doc).length === before.length + 6,
      "convergencia",
    );
    assert.ok(text(a.doc).includes("[A]") && text(a.doc).includes("[C]"));

    // Restauramos el título para el resto de tests.
    a.doc.transact(() => {
      const t = a.doc.getText(TITLE_FIELD);
      t.delete(0, t.length);
      t.insert(0, "Plan de lanzamiento");
    });
    await waitFor(() => text(c.doc) === "Plan de lanzamiento", "restaurar título");
    disconnect(a.provider);
    disconnect(c.provider);
  });

  test("un lector (viewer) recibe cambios pero no puede modificar el documento", async () => {
    const a = connect("user:a");
    const b = connect("user:b");
    await waitFor(() => a.provider.synced && b.provider.synced, "sync inicial");
    assert.equal(text(b.doc), "Plan de lanzamiento");

    b.doc.getText(TITLE_FIELD).insert(0, "HACK ");
    a.doc.getText(TITLE_FIELD).insert(text(a.doc).length, " v2");
    await waitFor(() => text(b.doc).endsWith(" v2"), "cambio de Alice llega al lector");
    await new Promise((r) => setTimeout(r, 150));

    assert.equal(text(a.doc), "Plan de lanzamiento v2");
    const roomDoc = server.getRoom(DOC)!.doc;
    assert.equal(getTitle(roomDoc), "Plan de lanzamiento v2");
    disconnect(a.provider);
    disconnect(b.provider);
  });

  test("el servidor impone la identidad real en la presencia (awareness)", async () => {
    const a = connect("user:a");
    const c = connect("user:c");
    await waitFor(() => a.provider.synced && c.provider.synced, "sync inicial");

    a.provider.awareness.setLocalStateField("user", { id: "x", name: "Suplantador", color: "#000000" });
    a.provider.awareness.setLocalStateField("cursor", { anchor: 1 });

    await waitFor(() => {
      const state = c.provider.awareness.getStates().get(a.doc.clientID);
      return state?.cursor?.anchor === 1;
    }, "awareness de Alice en Carol");
    const seen = c.provider.awareness.getStates().get(a.doc.clientID)!;
    assert.deepEqual(seen.user, { ...users.alice, role: "owner" });

    disconnect(a.provider);
    await waitFor(() => !c.provider.awareness.getStates().has(a.doc.clientID), "Alice desaparece al salir");
    disconnect(c.provider);
  });

  test("rechaza tokens inválidos (4401), sin acceso (4403) y documentos inexistentes (4404)", async () => {
    const noToken = connect("nope");
    const forbidden = connect("user:c", DOC_PRIVATE);
    const missing = connect("user:a", DOC_MISSING);
    const invalidId = connect("user:a", "no-es-un-uuid");

    const [e1, e2, e3, e4] = await Promise.all([
      waitForClose(noToken.provider),
      waitForClose(forbidden.provider),
      waitForClose(missing.provider),
      waitForClose(invalidId.provider),
    ]);
    assert.equal(e1.code, CloseCode.Unauthorized);
    assert.equal(e2.code, CloseCode.Forbidden);
    assert.equal(e3.code, CloseCode.NotFound);
    assert.equal(e4.code, CloseCode.NotFound);
    // y-websocket deja de reintentar con los códigos 44xx
    assert.equal(forbidden.provider.shouldConnect, false);
  });

  test("revalida permisos: cierra con 4409 si cambia el rol y 4403 si se revoca", async () => {
    const c = connect("user:c", DOC_PRIVATE);
    const b = connect("user:b", DOC_PRIVATE);
    // Aún no tienen acceso: se les concede "en la base de datos" y reconectan.
    await Promise.all([waitForClose(c.provider), waitForClose(b.provider)]);
    members[DOC_PRIVATE].c = "editor";
    members[DOC_PRIVATE].b = "viewer";
    c.provider.connect();
    b.provider.connect();
    await waitFor(() => c.provider.synced && b.provider.synced, "sync tras conceder acceso");

    const closedC = waitForClose(c.provider);
    const closedB = waitForClose(b.provider);
    members[DOC_PRIVATE].c = "viewer"; // degradado
    delete members[DOC_PRIVATE].b; // expulsado
    assert.equal((await closedC).code, CloseCode.PermissionsChanged);
    assert.equal((await closedB).code, CloseCode.Forbidden);
  });

  test("persiste al salir el último cliente y recarga el estado desde la base de datos", async () => {
    await waitFor(() => server.getRoom(DOC) === undefined, "documento descargado de memoria");

    const last = saves.filter((s) => s.id === DOC).at(-1)!;
    assert.equal(last.title, "Plan de lanzamiento v2");
    assert.equal(last.preview, "Hola desde Alice Respuesta de Carol");

    // Un cliente nuevo recibe el contenido cargado desde la "base de datos".
    const c = connect("user:c");
    await waitFor(() => c.provider.synced, "sync");
    await waitFor(() => text(c.doc) === "Plan de lanzamiento v2", "título recargado");
    assert.equal(getPreview(c.doc), "Hola desde Alice Respuesta de Carol");
    disconnect(c.provider);
  });

  test("cierra las conexiones con 4404 si el documento se borra", async () => {
    const a = connect("user:a");
    await waitFor(() => a.provider.synced, "sync");
    const closed = waitForClose(a.provider);

    stored.delete(DOC); // simulamos el borrado en la base de datos
    a.doc.getText(TITLE_FIELD).insert(0, "!");
    const event = await closed;
    assert.equal(event.code, CloseCode.NotFound);
  });
});
