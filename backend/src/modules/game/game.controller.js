
import { gameService } from "./game.service.js";

export const gameController = {
  async assignRoles(req, res, next) {
    try {
      const { roomCode, roles } = req.validated.body;

      const result = await gameService.assignRoles(
        roomCode,
        roles,
      );

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async assignRandomRoles(req, res, next) {
    try {
      const { roomCode } = req.validated.body;

      const result = await gameService.assignRandomRoles(
        roomCode,
      );

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },
};
