
import { Router } from "express";

import { gameController } from "./game.controller.js";
import {
  assignRolesSchema,
  randomRolesSchema,
} from "./game.validation.js";

import { validate } from "../../middleware/validate.middleware.js";

const router = Router();

router.post(
  "/roles/assign",
  validate(assignRolesSchema),
  gameController.assignRoles,
);

router.post(
  "/roles/random",
  validate(randomRolesSchema),
  gameController.assignRandomRoles,
);

export default router;
