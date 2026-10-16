import { Router } from "express";
import { z } from "zod";

import { roomController } from "./room.controller.js";
import {
  createRoomSchema,
  deleteRoomSchema,
  joinRoomSchema,
  reconnectSchema,
} from "./room.validation.js";

import { validate } from "../../middleware/validate.middleware.js";

const router = Router();

// Create a room
router.post(
  "/create",
  validate(createRoomSchema),
  roomController.create,
);

// Join an existing room
router.post(
  "/join",
  validate(joinRoomSchema),
  roomController.join,
);

// Authenticate a saved session after reconnecting
router.post(
  "/reconnect",
  validate(reconnectSchema),
  roomController.reconnect,
);

// Fetch lobby information
router.get(
  "/:roomCode",
  validate(
    z.object({
      roomCode: z.string().trim().toUpperCase().length(8),
    }),
    "params",
  ),
  roomController.getRoom,
);

// God kicks a player from the lobby
router.delete(
  "/:roomCode/players/:targetPlayerId",
  validate(
    z.object({
      roomCode: z.string().trim().toUpperCase().length(8),
      targetPlayerId: z.string().min(1),
    }),
    "params",
  ),
  validate(
    z.object({
      playerId: z.string().min(1),
      reconnectSecret: z.string().min(1),
    }),
  ),
  roomController.kickPlayer,
);

// Delete the entire lobby
router.delete(
  "/:roomCode",
  validate(deleteRoomSchema),
  roomController.delete,
);

export default router;