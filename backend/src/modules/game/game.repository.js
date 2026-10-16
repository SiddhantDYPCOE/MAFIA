import prisma from "../../db.js";

function getGameOutcome(players, roundNumber) {
  const alive = players.filter(
    (player) => player.isAlive && !player.isHost,
  );

  const mafiaCount = alive.filter(
    (player) => player.role === "MAFIA",
  ).length;

  const doctorCount = alive.filter(
    (player) => player.role === "DOCTOR",
  ).length;

  const nonMafiaCount = alive.length - mafiaCount;

  let winner = null;
  let reason = null;

  if (mafiaCount === 0) {
    winner = "CIVILIANS";
    reason = "All Mafia members have been eliminated.";
  } else if (
    alive.length === 2 &&
    mafiaCount === 1 &&
    doctorCount === 1
  ) {
    winner = "DRAW";
    reason = "Only the Mafia and Doctor remain.";
  } else if (mafiaCount >= nonMafiaCount) {
    winner = "MAFIA";
    reason = "The Mafia has reached a winning majority.";
  }

  if (!winner) return null;

  return {
    winner,
    reason,
    round: roundNumber,
    finishedAt: new Date().toISOString(),
  };
}

async function runSerializable(callback) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (error?.code !== "P2034" || attempt === 3) {
        throw error;
      }
    }
  }
}

async function evaluateOutcome(tx, roomId, roundNumber) {
  const players = await tx.player.findMany({
    where: { roomId },
    select: {
      id: true,
      username: true,
      role: true,
      isAlive: true,
      isHost: true,
    },
  });

  return getGameOutcome(players, roundNumber);
}

export const gameRepository = {
  async findRoomByCode(roomCode) {
    return prisma.gameRoom.findUnique({
      where: { code: roomCode },
      include: {
        players: { orderBy: { joinedAt: "asc" } },
      },
    });
  },

  async assignRoles(assignments) {
    return prisma.$transaction(
      assignments.map(({ playerId, role }) =>
        prisma.player.update({
          where: { id: playerId },
          data: { role },
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
        room: { code: roomCode },
      },
      select: {
        id: true,
        role: true,
        isAlive: true,
        room: {
          select: { status: true, phase: true },
        },
      },
    });
  },

  async findNightRoom(roomCode) {
    return prisma.gameRoom.findUnique({
      where: { code: roomCode },
      include: {
        players: { orderBy: { joinedAt: "asc" } },
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
        status: "PLAYING",
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
        status: "PLAYING",
        phase: "NIGHT",
        nightStep: expectedStep,
      },
      data: { nightState },
    });
  },

  async resolveNightAndStartDiscussion(
    roomId,
    nightState,
    killedPlayerId,
  ) {
    return runSerializable(async (tx) => {
      const room = await tx.gameRoom.findUnique({
        where: { id: roomId },
        select: {
          status: true,
          phase: true,
          nightStep: true,
          currentRoundNumber: true,
        },
      });

      if (
        !room ||
        room.status !== "PLAYING" ||
        room.phase !== "NIGHT" ||
        room.nightStep !== "NIGHT_END"
      ) {
        return { count: 0, gameResult: null };
      }

      if (killedPlayerId) {
        const eliminated = await tx.player.updateMany({
          where: {
            id: killedPlayerId,
            roomId,
            isAlive: true,
            isHost: false,
          },
          data: { isAlive: false },
        });

        if (eliminated.count !== 1) {
          throw new Error("The selected player can no longer be eliminated.");
        }
      }

      const gameResult = await evaluateOutcome(
        tx,
        roomId,
        room.currentRoundNumber,
      );

      await tx.gameRoom.update({
        where: { id: roomId },
        data: {
          phase: gameResult ? "FINISHED" : "DISCUSSION",
          nightStep: null,
          nightState: {
            ...(nightState ?? {}),
            ...(gameResult ? { gameResult } : {}),
          },
        },
      });

      return { count: 1, gameResult };
    });
  },

  async getVotingRoom(roomCode) {
    return prisma.gameRoom.findUnique({
      where: { code: roomCode },
      include: {
        players: { orderBy: { joinedAt: "asc" } },
      },
    });
  },

  async startVotingFromDiscussion(roomId, nightState) {
    return prisma.gameRoom.updateMany({
      where: {
        id: roomId,
        status: "PLAYING",
        phase: "DISCUSSION",
        nightStep: null,
      },
      data: {
        phase: "VOTING",
        nightState,
      },
    });
  },

  async createVote({
    roomId,
    roundNumber,
    attempt,
    voterId,
    targetId,
  }) {
    return runSerializable(async (tx) => {
      const room = await tx.gameRoom.findUnique({
        where: { id: roomId },
        select: {
          status: true,
          phase: true,
          currentRoundNumber: true,
          nightState: true,
          players: {
            select: { id: true, isAlive: true, isHost: true },
          },
        },
      });

      const voting = room?.nightState?.voting;

      if (
        !room ||
        room.status !== "PLAYING" ||
        room.phase !== "VOTING" ||
        room.currentRoundNumber !== roundNumber ||
        voting?.status !== "OPEN" ||
        voting.attempt !== attempt
      ) {
        throw new Error("Voting has closed or changed. Refresh and try again.");
      }

      const voter = room.players.find(
        (player) =>
          player.id === voterId &&
          player.isAlive &&
          !player.isHost,
      );

      if (!voter) {
        throw new Error("Only living players can vote.");
      }

      const target = room.players.find(
        (player) =>
          player.id === targetId &&
          player.isAlive &&
          !player.isHost,
      );

      if (!target) {
        throw new Error("Choose a living player.");
      }

      if (
        voting.candidates?.length > 0 &&
        !voting.candidates.includes(targetId)
      ) {
        throw new Error("A revote is limited to the tied candidates.");
      }

      return tx.vote.create({
        data: { roomId, roundNumber, attempt, voterId, targetId },
      });
    });
  },

  async findVote(roomId, roundNumber, attempt, voterId) {
    return prisma.vote.findUnique({
      where: {
        roomId_roundNumber_attempt_voterId: {
          roomId,
          roundNumber,
          attempt,
          voterId,
        },
      },
    });
  },

  async getVotes(roomId, roundNumber, attempt) {
    return prisma.vote.findMany({
      where: { roomId, roundNumber, attempt },
      include: {
        target: { select: { id: true, username: true } },
      },
    });
  },

  async getVotingProgress(roomId, roundNumber, attempt) {
    return prisma.vote.findMany({
      where: { roomId, roundNumber, attempt },
      select: { voterId: true, targetId: true },
    });
  },

  async updateVotingState(
    roomId,
    expectedRound,
    expectedAttempt,
    expectedStatus,
    nightState,
  ) {
    return runSerializable(async (tx) => {
      const room = await tx.gameRoom.findUnique({
        where: { id: roomId },
        select: {
          status: true,
          phase: true,
          currentRoundNumber: true,
          nightState: true,
        },
      });

      const voting = room?.nightState?.voting;

      if (
        !room ||
        room.status !== "PLAYING" ||
        room.phase !== "VOTING" ||
        room.currentRoundNumber !== expectedRound ||
        voting?.attempt !== expectedAttempt ||
        voting?.status !== expectedStatus
      ) {
        return { count: 0 };
      }

      // Serializable transaction plus the checks above prevent stale resolutions.
      return tx.gameRoom.updateMany({
        where: {
          id: roomId,
          status: "PLAYING",
          phase: "VOTING",
          currentRoundNumber: expectedRound,
        },
        data: { nightState },
      });
    });
  },

  async eliminatePlayerAndStartNextNight(
    roomId,
    roundNumber,
    playerId,
    nightState,
  ) {
    return runSerializable(async (tx) => {
      const room = await tx.gameRoom.findUnique({
        where: { id: roomId },
        select: {
          status: true,
          phase: true,
          currentRoundNumber: true,
        },
      });

      if (
        !room ||
        room.status !== "PLAYING" ||
        room.phase !== "VOTING" ||
        room.currentRoundNumber !== roundNumber
      ) {
        return { count: 0, gameResult: null };
      }

      if (playerId) {
        const eliminated = await tx.player.updateMany({
          where: {
            id: playerId,
            roomId,
            isHost: false,
            isAlive: true,
          },
          data: { isAlive: false },
        });

        if (eliminated.count !== 1) {
          throw new Error("That player can no longer be eliminated.");
        }
      }

      const nextRound = roundNumber + 1;
      const gameResult = await evaluateOutcome(tx, roomId, roundNumber);

      await tx.gameRoom.update({
        where: { id: roomId },
        data: {
          phase: gameResult ? "FINISHED" : "NIGHT",
          currentRoundNumber: gameResult ? roundNumber : nextRound,
          nightStep: gameResult ? null : "ALL_SLEEP",
          nightState: {
            ...(nightState ?? {}),
            ...(gameResult ? { gameResult } : {}),
          },
        },
      });

      return { count: 1, gameResult };
    });
  },

  async finishGameIfNeeded(roomCode) {
    return runSerializable(async (tx) => {
      const room = await tx.gameRoom.findUnique({
        where: { code: roomCode },
        include: { players: true },
      });

      if (!room) {
        return { finished: false, gameResult: null };
      }

      if (room.phase === "FINISHED") {
        return {
          finished: true,
          gameResult: room.nightState?.gameResult ?? null,
        };
      }

      if (
        room.status !== "PLAYING" ||
        room.phase !== "DISCUSSION"
      ) {
        return { finished: false, gameResult: null };
      }

      const gameResult = getGameOutcome(
        room.players,
        room.currentRoundNumber,
      );

      if (!gameResult) {
        return { finished: false, gameResult: null };
      }

      const updated = await tx.gameRoom.updateMany({
        where: {
          id: room.id,
          status: "PLAYING",
          phase: "DISCUSSION",
          currentRoundNumber: room.currentRoundNumber,
        },
        data: {
          phase: "FINISHED",
          nightStep: null,
          nightState: {
            ...(room.nightState ?? {}),
            gameResult,
          },
        },
      });

      return {
        finished: updated.count === 1,
        gameResult,
      };
    });
  },
async resetFinishedGame(roomCode) {
  return prisma.$transaction(
    async (tx) => {
      const room = await tx.gameRoom.findUnique({
        where: { code: roomCode },
        select: {
          id: true,
          phase: true,
        },
      });

      if (!room) {
        throw new Error("Room not found.");
      }

      if (room.phase !== "FINISHED") {
        throw new Error("You can only play again after the game finishes.");
      }

      // Remove voting history from the previous game.
      await tx.vote.deleteMany({
        where: { roomId: room.id },
      });

      // Remove the previous game's rounds.
      await tx.gameRound.deleteMany({
        where: { roomId: room.id },
      });

      // Keep every player and their reconnect credentials.
      await tx.player.updateMany({
        where: { roomId: room.id },
        data: {
          role: null,
          isAlive: true,
        },
      });

      // Reset the existing room for a fresh game.
      await tx.gameRoom.update({
        where: { id: room.id },
        data: {
          status: "LOBBY",
          phase: "LOBBY",
          currentRoundNumber: 0,
          nightStep: null,
          nightState: null,
        },
      });

      return tx.gameRoom.findUnique({
        where: { id: room.id },
        include: {
          players: {
            orderBy: { joinedAt: "asc" },
          },
        },
      });
    },
    {
      isolationLevel: "Serializable",
    },
  );
},
  async updateRoom(roomId, data) {
    return prisma.gameRoom.update({
      where: { id: roomId },
      data,
    });
  },
};