import http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { CloseCode, isUuid } from "../src/lib/collab/protocol";
import { Room, type RoomOptions } from "./room";
import {
  CollabError,
  type AuthContext,
  type Authorize,
  type GetRoles,
  type Logger,
  type Persistence,
} from "./types";

export interface CollabServerOptions {
  authorize: Authorize;
  persistence: Persistence;
  /** Si se indica, se revalidan los permisos de las conexiones abiertas. */
  getRoles?: GetRoles;
  permissionsCheckIntervalMs?: number;
  logger?: Logger;
  /** Orígenes permitidos (p. ej. https://notas.ejemplo.com). Vacío = cualquiera. */
  allowedOrigins?: string[];
  heartbeatIntervalMs?: number;
  maxPayloadBytes?: number;
  room?: Partial<RoomOptions>;
}

export const consoleLogger: Logger = {
  info: (message, meta) => console.log(`[collab] ${message}`, meta ?? ""),
  warn: (message, meta) => console.warn(`[collab] ${message}`, meta ?? ""),
  error: (message, meta) => console.error(`[collab] ${message}`, meta ?? ""),
};

/**
 * Servidor WebSocket de colaboración en tiempo real basado en Yjs.
 *
 * URL de conexión:  ws(s)://host/<documentId>?token=<access_token de Supabase>
 *
 * Cada documento abierto vive en memoria como una `Room`. Las actualizaciones
 * (CRDT) se reenvían al resto de clientes al instante y se persisten con
 * debounce. Cuando sale el último cliente se guarda y se libera la memoria.
 */
export function createCollabServer(options: CollabServerOptions) {
  const logger = options.logger ?? consoleLogger;
  const roomOptions: RoomOptions = {
    saveDebounceMs: options.room?.saveDebounceMs ?? 1500,
    saveMaxWaitMs: options.room?.saveMaxWaitMs ?? 10_000,
  };
  const allowedOrigins = new Set(options.allowedOrigins?.filter(Boolean) ?? []);

  /** Salas cargándose o cargadas (promesa compartida por conexiones simultáneas). */
  const rooms = new Map<string, Promise<Room>>();
  /** Salas ya cargadas, para comprobaciones síncronas. */
  const loadedRooms = new Map<string, Room>();
  const alive = new WeakMap<WebSocket, boolean>();
  let closing = false;

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: options.maxPayloadBytes ?? 10 * 1024 * 1024,
  });

  const httpServer = http.createServer((req, res) => {
    if ((req.method === "GET" || req.method === "HEAD") && req.url === "/health") {
      // CORS abierto: la web lo llama para "despertar" el servidor en hostings
      // gratuitos que se duermen. No expone datos sensibles.
      res.writeHead(200, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ status: "ok", rooms: loadedRooms.size, connections: wss.clients.size }));
      return;
    }
    res.writeHead(426, { "content-type": "text/plain; charset=utf-8" });
    res.end("Este servidor solo acepta conexiones WebSocket.\n");
  });

  // ---------------------------------------------------------------------------
  // Ciclo de vida de las salas
  // ---------------------------------------------------------------------------

  async function loadRoom(documentId: string): Promise<Room> {
    const loaded = await options.persistence.load(documentId);
    if (!loaded) throw new CollabError(CloseCode.NotFound, "Documento no encontrado");
    logger.info("Documento cargado", { room: documentId });
    const room = new Room(documentId, loaded, options.persistence, logger, roomOptions);
    loadedRooms.set(documentId, room);
    return room;
  }

  async function acquireRoom(documentId: string): Promise<Room> {
    let entry = rooms.get(documentId);
    if (!entry) {
      const created = loadRoom(documentId);
      entry = created;
      rooms.set(documentId, created);
      created.catch(() => {
        if (rooms.get(documentId) === created) rooms.delete(documentId);
      });
    }
    const room = await entry;
    // Pudo destruirse mientras esperábamos: lo volvemos a cargar.
    if (room.destroyed) return acquireRoom(documentId);
    room.refs++;
    return room;
  }

  async function releaseRoom(room: Room) {
    room.refs--;
    if (room.refs > 0) return;
    await room.flush();
    // A partir de aquí todo es síncrono: nadie puede adquirir la sala en medio.
    if (room.refs > 0 || room.destroyed) return;
    if (loadedRooms.get(room.id) === room) {
      loadedRooms.delete(room.id);
      rooms.delete(room.id);
    }
    room.destroy();
    logger.info("Documento descargado de memoria", { room: room.id });
  }

  // ---------------------------------------------------------------------------
  // Conexiones
  // ---------------------------------------------------------------------------

  function checkOrigin(req: http.IncomingMessage) {
    if (allowedOrigins.size === 0) return;
    const origin = req.headers.origin;
    if (!origin || !allowedOrigins.has(origin)) {
      throw new CollabError(CloseCode.Forbidden, "Origen no permitido");
    }
  }

  async function handleUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer) {
    socket.on("error", () => socket.destroy());

    const url = new URL(req.url ?? "/", "http://localhost");
    const documentId = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ""));
    const token = url.searchParams.get("token");

    let auth: AuthContext | null = null;
    let room: Room | null = null;
    let failure: { code: number; reason: string } | null = null;

    try {
      if (closing) throw new CollabError(CloseCode.ServerRestart, "Servidor reiniciándose");
      checkOrigin(req);
      if (!isUuid(documentId)) throw new CollabError(CloseCode.NotFound, "Documento no válido");
      auth = await options.authorize(token, documentId);
      room = await acquireRoom(documentId);
    } catch (err) {
      if (err instanceof CollabError) {
        failure = { code: err.code, reason: err.message };
      } else {
        logger.error("Error al abrir la conexión", {
          room: documentId,
          error: err instanceof Error ? err.message : String(err),
        });
        // 1011 = error interno: el cliente reintentará con backoff.
        failure = { code: 1011, reason: "Error interno" };
      }
    }

    // El cliente pudo irse mientras autorizábamos.
    if (!socket.readable || !socket.writable) {
      socket.destroy();
      if (room) void releaseRoom(room);
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      if (failure || !room || !auth) {
        // Completamos el handshake para poder comunicar el motivo con un close code.
        ws.close(failure?.code ?? 1011, failure?.reason ?? "Error interno");
        return;
      }
      const acquired = room;
      alive.set(ws, true);
      ws.on("pong", () => alive.set(ws, true));
      acquired.addConnection(ws, auth, () => void releaseRoom(acquired));
      logger.info("Cliente conectado", {
        room: acquired.id,
        user: auth.user.id,
        role: auth.role,
        connections: acquired.connectionCount,
      });
    });
  }

  httpServer.on("upgrade", (req, socket, head) => {
    void handleUpgrade(req, socket, head);
  });

  // Ping periódico para detectar y cerrar conexiones muertas.
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (alive.get(ws) === false) {
        ws.terminate();
        return;
      }
      alive.set(ws, false);
      ws.ping();
    });
  }, options.heartbeatIntervalMs ?? 30_000);
  heartbeat.unref();

  // Revalida permisos: si a alguien le quitan el acceso o le cambian el rol
  // mientras está conectado, se cierra su conexión.
  const getRoles = options.getRoles;
  const permissionsCheck = getRoles
    ? setInterval(() => {
        for (const room of loadedRooms.values()) {
          if (room.connectionCount === 0) continue;
          getRoles(room.id)
            .then((roles) => room.applyRoles(roles))
            .catch((err: unknown) =>
              logger.warn("No se pudieron revalidar los permisos", {
                room: room.id,
                error: err instanceof Error ? err.message : String(err),
              }),
            );
        }
      }, options.permissionsCheckIntervalMs ?? 30_000)
    : null;
  permissionsCheck?.unref();

  return {
    httpServer,

    listen(port: number, host?: string) {
      return new Promise<number>((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, host, () => {
          const address = httpServer.address();
          resolve(typeof address === "object" && address ? address.port : port);
        });
      });
    },

    /** Número de documentos cargados en memoria. */
    get roomCount() {
      return loadedRooms.size;
    },

    /** Sala cargada en memoria (útil para tests y métricas). */
    getRoom(documentId: string) {
      return loadedRooms.get(documentId);
    },

    /** Cierre ordenado: guarda todo y desconecta (los clientes reintentarán). */
    async close() {
      closing = true;
      clearInterval(heartbeat);
      if (permissionsCheck) clearInterval(permissionsCheck);
      await Promise.allSettled(rooms.values());
      const open = [...loadedRooms.values()];
      await Promise.allSettled(open.map((room) => room.flush()));
      for (const room of open) room.closeAll(CloseCode.ServerRestart, "Servidor reiniciándose");
      // Damos un momento para que lleguen los frames de cierre antes de cortar.
      const deadline = Date.now() + 1000;
      while (wss.clients.size > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      wss.clients.forEach((ws) => ws.terminate());
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      for (const room of open) if (!room.destroyed) room.destroy();
      rooms.clear();
      loadedRooms.clear();
    },
  };
}

export type CollabServer = ReturnType<typeof createCollabServer>;
