
import express from "express";
import cors from "cors";
import "dotenv/config";

import gameRoutes from "./src/modules/game/game.routes.js";
import roomRoutes from "./src/modules/room/room.routes.js";
import { errorMiddleware } from "./src/middleware/error.middleware.js";

export const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json());

app.use("/api/rooms", roomRoutes);
app.use("/api/game", gameRoutes);

app.use(errorMiddleware);