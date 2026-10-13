
import { Router } from "express";

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
    (await import("zod")).z.object({
      roomCode: (await import("zod")).z.string().trim().toUpperCase().length(8),
    }),
    "params",
  ),
  roomController.getRoom,
);

router.delete(
  "/:roomCode",
  validate(deleteRoomSchema),
  roomController.delete,
);

export default router;

