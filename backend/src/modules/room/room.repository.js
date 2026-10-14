
import prisma from "../../db.js";

export const roomRepository = {
  findByCode(code) {
    return prisma.gameRoom.findUnique({
      where: { code },
      include: {
        players: {
          orderBy: { joinedAt: "asc" },
        },
      },
    });
  },

  createRoomWithHost({ code, username, secretHash }) {
    return prisma.$transaction(async (tx) => {
      const room = await tx.gameRoom.create({
        data: { code },
      });

      const host = await tx.player.create({
        data: {
          roomId: room.id,
          username,
          isHost: true,
          reconnectSecretHash: secretHash,
          isConnected: false,
        },
      });

      return tx.gameRoom.update({
        where: { id: room.id },
        data: { hostPlayerId: host.id },
        include: { players: true },
      });
    });
  },

  createPlayer({ roomId, username, secretHash }) {
    return prisma.player.create({
      data: {
        roomId,
        username,
        reconnectSecretHash: secretHash,
        isConnected: true,
      },
    });
  },

  findPlayerById(playerId) {
    return prisma.player.findUnique({
      where: { id: playerId },
      include: { room: true },
    });
  },

  updateConnection(playerId, isConnected) {
    return prisma.player.update({
      where: { id: playerId },
      data: {
        isConnected,
        lastSeenAt: new Date(),
      },
    });
  },

  findPlayerByUsername(roomId, username) {
    return prisma.player.findUnique({
      where: {
        roomId_username: { roomId, username },
      },
    });
  },

deleteExpiredRooms(cutoff) {
  return prisma.gameRoom.deleteMany({
    where: {
      createdAt: {
        lt: cutoff,
      },
    },
  });
},

  deleteRoomById(roomId) {
  return prisma.gameRoom.delete({
    where: { id: roomId },
  });
},
};