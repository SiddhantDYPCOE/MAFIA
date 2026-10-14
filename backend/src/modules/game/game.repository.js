
import prisma from "../../db.js";

export const gameRepository = {
  async findRoomByCode(roomCode) {
    return prisma.gameRoom.findUnique({
      where: {
        code: roomCode,
      },
      include: {
        players: {
          orderBy: {
            joinedAt: "asc",
          },
        },
      },
    });
  },

  async assignRoles(assignments) {
    return prisma.$transaction(
      assignments.map(({ playerId, role }) =>
        prisma.player.update({
          where: {
            id: playerId,
          },
          data: {
            role,
          },
        }),
      ),
    );
  },

async startGame(roomId) {
  return prisma.$transaction(async (tx) => {
    const room = await tx.gameRoom.update({
      where: { id: roomId },
      data: {
        status: "PLAYING",
        phase: "NIGHT",
        currentRoundNumber: 1,
      },
    });

    await tx.gameRound.create({
      data: {
        roomId,
        roundNumber: 1,
        phase: "NIGHT",
      },
    });

    return room;
  });
},

async findPlayerRole(roomCode, playerId) {
  return prisma.player.findFirst({
    where: {
      id: playerId,
      room: {
        code: roomCode,
      },
    },
    select: {
      id: true,
      role: true,
      isAlive: true,
      room: {
        select: {
          status: true,
          phase: true,
        },
      },
    },
  });
},


async resolveNightAndStartDiscussion(roomId, nightState, killedPlayerId) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.gameRoom.updateMany({
      where: {
        id: roomId,
        phase: "NIGHT",
        nightStep: "NIGHT_END",
      },
      data: {
        phase: "DISCUSSION",
        nightStep: null,
        nightState,
      },
    });

    if (result.count !== 1) {
      return { count: 0 };
    }

    if (killedPlayerId) {
      await tx.player.updateMany({
        where: {
          id: killedPlayerId,
          isAlive: true,
          isHost: false,
        },
        data: {
          isAlive: false,
        },
      });
    }

    return { count: 1 };
  });
},

async startVotingFromDiscussion(roomId) {
  return prisma.gameRoom.updateMany({
    where: {
      id: roomId,
      phase: "DISCUSSION",
      nightStep: null,
    },
    data: {
      phase: "VOTING",
    },
  });
},


async findNightRoom(roomCode) {
  return prisma.gameRoom.findUnique({
    where: { code: roomCode },
    include: {
      players: {
        orderBy: { joinedAt: "asc" },
      },
    },
  });
},

async startNight(roomId, expectedPhase, data) {
  return prisma.gameRoom.updateMany({
    where: {
      id: roomId,
      phase: expectedPhase,
      nightStep: null,
    },
    data,
  });
},

async advanceNight(roomId, expectedStep, data) {
  return prisma.gameRoom.updateMany({
    where: {
      id: roomId,
      phase: "NIGHT",
      nightStep: expectedStep,
    },
    data,
  });
},

async updateNightSelection(roomId, expectedStep, nightState) {
  return prisma.gameRoom.updateMany({
    where: {
      id: roomId,
      phase: "NIGHT",
      nightStep: expectedStep,
    },
    data: { nightState },
  });
},

  async updateRoom(roomId, data) {
    return prisma.gameRoom.update({
      where: {
        id: roomId,
      },
      data,
    });
  },
};
