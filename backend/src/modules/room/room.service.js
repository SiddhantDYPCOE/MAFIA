
import { timingSafeEqual } from "node:crypto";
import { roomRepository } from "./room.repository.js";
import {
  generateReconnectSecret,
  hashReconnectSecret,
} from "../../utils/generateReconnectSecret.js";
import { generateRoomCode } from "../../utils/generateRoomCode.js";

function safeEqual(a, b) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");

  return (
    left.length === right.length &&
    timingSafeEqual(left, right)
  );
}

export const roomService = {
  async createRoom(hostName) {
    let room;
    let secret;

    for (let attempt = 0; attempt < 5; attempt++) {
      secret = generateReconnectSecret();

      try {
        room = await roomRepository.createRoomWithHost({
          code: generateRoomCode(),
          username: hostName,
          secretHash: hashReconnectSecret(secret),
        });

        break;
      } catch (error) {
        if (error?.code !== "P2002" || attempt === 4) {
          throw error;
        }
      }
    }

    const host = room.players.find((player) => player.isHost);

    return {
      room: this.toPublicRoom(room),
      session: {
        roomCode: room.code,
        playerId: host.id,
        reconnectSecret: secret,
      },
    };
  },

  async joinRoom(roomCode, username) {
    const room = await roomRepository.findByCode(roomCode);

    if (!room) {
      throw Object.assign(new Error("Room not found"), {
        statusCode: 404,
      });
    }

    if (room.status !== "LOBBY") {
      throw Object.assign(
        new Error("This game has already started"),
        { statusCode: 409 },
      );
    }

    const existing = await roomRepository.findPlayerByUsername(
      room.id,
      username,
    );

    if (existing) {
      throw Object.assign(
        new Error("That username is already taken in this room"),
        { statusCode: 409 },
      );
    }

    const reconnectSecret = generateReconnectSecret();

    const player = await roomRepository.createPlayer({
      roomId: room.id,
      username,
      secretHash: hashReconnectSecret(reconnectSecret),
    });

    return {
      player: this.toPublicPlayer(player),
      session: {
        roomCode: room.code,
        playerId: player.id,
        reconnectSecret,
      },
    };
  },

  async deleteRoom({ roomCode, playerId, reconnectSecret }) {
  const normalizedCode = roomCode.toUpperCase();

  const session = await this.authenticateSession({
    roomCode: normalizedCode,
    playerId,
    reconnectSecret,
  });

  const room = await roomRepository.findByCode(normalizedCode);

  if (!room) {
    const error = new Error("Room not found");
    error.statusCode = 404;
    throw error;
  }

  if (room.hostPlayerId !== session.playerId) {
    const error = new Error("Only the host can delete this lobby");
    error.statusCode = 403;
    throw error;
  }

  await roomRepository.deleteRoomById(room.id);

  return {
    roomCode: normalizedCode,
    message: "Lobby deleted successfully",
  };
},

  async authenticateSession({
    roomCode,
    playerId,
    reconnectSecret,
  }) {
    const player = await roomRepository.findPlayerById(playerId);

    if (!player || player.room.code !== roomCode) {
      throw new Error("Invalid session");
    }

    const suppliedHash = hashReconnectSecret(reconnectSecret);

    if (
      !safeEqual(suppliedHash, player.reconnectSecretHash)
    ) {
      throw new Error("Invalid session");
    }

    if (player.room.status === "FINISHED") {
      throw new Error("This game has ended");
    }

    return {
      playerId: player.id,
      roomId: player.roomId,
      roomCode: player.room.code,
      username: player.username,
      isHost: player.isHost,
    };
  },

  toPublicPlayer(player) {
    return {
      id: player.id,
      username: player.username,
      isHost: player.isHost,
      isConnected: player.isConnected,
      isAlive: player.isAlive,
    };
  },

  toPublicRoom(room) {
    return {
      id: room.id,
      code: room.code,
      status: room.status,
      hostPlayerId: room.hostPlayerId,
      players: room.players.map((player) =>
        this.toPublicPlayer(player),
      ),
    };
  },
};