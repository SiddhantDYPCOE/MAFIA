import { Server } from "socket.io";
import "dotenv/config"
import { socketAuth } from "../socket/socketAuth.js";

const allowedOrigins = [
  "https://mafia-six-rosy.vercel.app"
];

export function createSocketServer(httpServer) {

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin === process.env.FRONTEND_URL) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by Socket.IO CORS"));
        }
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(socketAuth);

  return io;
}