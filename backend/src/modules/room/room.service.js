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

  return left.length === right.length && timingSafeEqual(left, right);
}

function createError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
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
    const normalizedCode = roomCode.toUpperCase();
    const room = await roomRepository.findByCode(normalizedCode);

    if (!room) {
      throw createError("Room not found", 404);
    }

    if (room.status !== "LOBBY") {
      throw createError("This game has already started", 409);
    }

    const existing = await roomRepository.findPlayerByUsername(
      room.id,
      username,
    );

    if (existing) {
      throw createError(
        "That username is already taken in this room",
        409,
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

  async kickPlayer({
    roomCode,
    targetPlayerId,
    playerId,
    reconnectSecret,
  }) {
    const normalizedCode = roomCode.toUpperCase();

   
    const session = await this.authenticateSession({
      roomCode: normalizedCode,
      playerId,
      reconnectSecret,
    });

    const room = await roomRepository.findByCode(normalizedCode);

    if (!room) {
      throw createError("Room not found", 404);
    }

    
    if (
      room.hostPlayerId !== session.playerId ||
      !session.isHost
    ) {
      throw createError("Only God can kick players", 403);
    }

   
    if (room.status !== "LOBBY") {
      throw createError(
        "Players can only be kicked while the room is in the lobby",
        409,
      );
    }

    const targetPlayer = room.players.find(
      (player) => player.id === targetPlayerId,
    );

    if (!targetPlayer) {
      throw createError("Player not found in this room", 404);
    }

    if (targetPlayer.isHost || targetPlayer.id === room.hostPlayerId) {
      throw createError("The host cannot be kicked", 403);
    }

    await roomRepository.deletePlayerById(targetPlayer.id);

    const updatedRoom = await roomRepository.findByCode(normalizedCode);

    return {
      room: this.toPublicRoom(updatedRoom),
      kickedPlayerId: targetPlayer.id,
      kickedUsername: targetPlayer.username,
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
      throw createError("Room not found", 404);
    }

    if (room.hostPlayerId !== session.playerId) {
      throw createError("Only the host can delete this lobby", 403);
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
      throw createError("Invalid session", 401);
    }

    const suppliedHash = hashReconnectSecret(reconnectSecret);

    if (!safeEqual(suppliedHash, player.reconnectSecretHash)) {
      throw createError("Invalid session", 401);
    }

    if (player.room.status === "FINISHED") {
      throw createError("This game has ended", 409);
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

  // toPublicRoom(room) {
  //   return {
  //     id: room.id,
  //     code: room.code,
  //     status: room.status,
  //     hostPlayerId: room.hostPlayerId,
  //     players: room.players.map((player) => this.toPublicPlayer(player)),
  //   };
  // },
  
toPublicRoom(room) {
  return {
    id: room.id,
    code: room.code,
    status: room.status,
    phase: room.phase,
    currentRoundNumber: room.currentRoundNumber,
    hostPlayerId: room.hostPlayerId,
    players: room.players.map((player) =>
      this.toPublicPlayer(player),
    ),
  };
},

};