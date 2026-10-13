
import { roomService } from "./room.service.js";
import { roomRepository } from "./room.repository.js";

export const roomController = {
  async create(req, res, next) {
    try {
      const { hostName } = req.validated.body;

      const result = await roomService.createRoom(hostName);

      res.status(201).json({
        success: true,
        message: "Room created successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async join(req, res, next) {
    try {
      const { roomCode, username } = req.validated.body;

      const result = await roomService.joinRoom(roomCode, username);

      res.status(201).json({
        success: true,
        message: "Joined room successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async reconnect(req, res, next) {
    try {
      const session = await roomService.authenticateSession(
        req.validated.body,
      );

      res.status(200).json({
        success: true,
        message: "Session authenticated successfully",
        data: { session },
      });
    } catch (error) {
      next(error);
    }
  },

  async getRoom(req, res, next) {
    try {
      const { roomCode } = req.validated.params;

      const room = await roomRepository.findByCode(roomCode);

      if (!room) {
        return res.status(404).json({
          success: false,
          message: "Room not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Room fetched successfully",
        data: {
          room: roomService.toPublicRoom(room),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async delete(req, res, next) {
  try {
    const result = await roomService.deleteRoom({
      roomCode: req.params.roomCode,
      playerId: req.body.playerId,
      reconnectSecret: req.body.reconnectSecret,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
},
};
