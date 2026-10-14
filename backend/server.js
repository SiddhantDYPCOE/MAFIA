
import "dotenv/config";
import { createServer } from "node:http";

import { app } from "./app.js";
import prisma from "./src/db.js";
import { createSocketServer } from "./src/config/socket.js";
import { registerSocketHandlers } from "./src/socket/index.js";

import { startRoomCleanup } from "./src/modules/room/room.cleanup.js";

const PORT = Number(process.env.PORT) || 5000;

const httpServer = createServer(app);

const io = createSocketServer(httpServer);
startRoomCleanup();

registerSocketHandlers(io);

async function startServer() {
  try {
    await prisma.$connect();

    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`MAFIA API running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start MAFIA server:", error);
    process.exit(1);
  }
}

async function shutdown() {
  console.log("Shutting down MAFIA server...");

  io.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startServer();