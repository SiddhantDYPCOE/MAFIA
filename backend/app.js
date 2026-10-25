
import express from "express";
import cors from "cors";
import "dotenv/config";

import gameRoutes from "./src/modules/game/game.routes.js";
import roomRoutes from "./src/modules/room/room.routes.js";
import { errorMiddleware } from "./src/middleware/error.middleware.js";

export const app = express();


const allowedOrigins = [
  "https://mafia-olive-xi.vercel.app",
  "https://localhost",
  "http://localhost",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin === process.env.FRONTEND_URL
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by Express CORS"));
      }
    },
    credentials: true,
  })
);


app.use(express.json());

app.use("/api/rooms", roomRoutes);
app.use("/api/game", gameRoutes);

app.use(errorMiddleware);