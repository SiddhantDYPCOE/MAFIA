import { Server } from "socket.io";
import "dotenv/config"
import { socketAuth } from "../socket/socketAuth.js";

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://192.168.1.22:5173" || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(socketAuth);

  return io;
}