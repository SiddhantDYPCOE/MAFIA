
import express from "express";
import cors from "cors";
import "dotenv/config";

import roomRoutes from "./src/modules/room/room.routes.js";
import { errorMiddleware } from "./src/middleware/error.middleware.js";

export const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());

app.use("/api/rooms", roomRoutes);

app.use(errorMiddleware);