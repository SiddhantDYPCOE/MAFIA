import { gameRepository } from "./game.repository.js";

const INITIAL_NIGHT_STATE = {
  mafiaSelections: {},
  mafiaTarget: null,
  doctorSelection: null,
  doctorSave: null,
  policeSelection: null,
  policeCheck: null,
};

function getVotingState(room) {
  return room.nightState?.voting ?? {
    attempt: 1,
    candidates: [],
    status: "OPEN",
    tiedCandidates: [],
    finalCounts: [],
  };
}

function getEligiblePlayers(room) {
  return room.players.filter(
    (player) => player.isAlive && !player.isHost,
  );
}

function tallyVotes(votes, eligiblePlayers, candidates = []) {
  const counts = new Map();

  for (const player of eligiblePlayers) {
    if (
      candidates.length === 0 ||
      candidates.includes(player.id)
    ) {
      counts.set(player.id, {
        playerId: player.id,
        username: player.username,
        count: 0,
      });
    }
  }

  for (const vote of votes) {
    const current = counts.get(vote.targetId);
    if (current) current.count += 1;
  }

  return [...counts.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.username.localeCompare(b.username),
  );
}

async function getRoom(roomCode) {
  const room = await gameRepository.getVotingRoom(roomCode);

  if (!room) {
    throw new Error("Room not found.");
  }

  return room;
}

export const votingService = {
  async startVoting(roomCode) {
    const room = await getRoom(roomCode);

    // Check the persisted result before attempting to open voting.
    const gameCheck = await gameRepository.finishGameIfNeeded(roomCode);

    if (gameCheck.finished) {
      return {
        phase: "FINISHED",
        round: room.currentRoundNumber,
        gameResult: gameCheck.gameResult,
      };
    }

    if (
      room.status !== "PLAYING" ||
      room.phase !== "DISCUSSION"
    ) {
      throw new Error("Voting can only start during discussion.");
    }

    const nightState = {
      ...INITIAL_NIGHT_STATE,
      voting: {
        attempt: 1,
        candidates: [],
        status: "OPEN",
        tiedCandidates: [],
        finalCounts: [],
      },
    };

    const result = await gameRepository.startVotingFromDiscussion(
      room.id,
      nightState,
    );

    if (result.count !== 1) {
      throw new Error("Voting has already started.");
    }

    return {
      phase: "VOTING",
      round: room.currentRoundNumber,
      votingRound: room.currentRoundNumber,
      attempt: 1,
      votingStatus: "OPEN",
    };
  },

  async castVote(roomCode, voterId, targetId) {
    const room = await getRoom(roomCode);

    if (room.status !== "PLAYING" || room.phase !== "VOTING") {
      throw new Error("Voting is not active.");
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

    const voting = getVotingState(room);

    if (voting.status !== "OPEN") {
      throw new Error("Voting is closed. Wait for God.");
    }

    if (
      voting.candidates.length > 0 &&
      !voting.candidates.includes(target.id)
    ) {
      throw new Error("A revote is limited to the tied candidates.");
    }

    try {
      await gameRepository.createVote({
        roomId: room.id,
        roundNumber: room.currentRoundNumber,
        attempt: voting.attempt,
        voterId,
        targetId,
      });
    } catch (error) {
      if (error?.code === "P2002") {
        throw new Error("You have already voted in this voting round.");
      }

      throw error;
    }

    return { success: true, hasVoted: true };
  },

  async getPlayerState(roomCode, playerId) {
    const room = await getRoom(roomCode);
    const voting = getVotingState(room);

    const player = room.players.find(
      (item) => item.id === playerId && !item.isHost,
    );

    if (!player) {
      throw new Error("Player not found.");
    }

    const vote =
      room.phase === "VOTING"
        ? await gameRepository.findVote(
            room.id,
            room.currentRoundNumber,
            voting.attempt,
            playerId,
          )
        : null;

    return {
      phase: room.phase,
      round: room.currentRoundNumber,
      votingRound: room.currentRoundNumber,
      attempt: voting.attempt,
      votingStatus: voting.status,
      hasVoted: Boolean(vote),
      candidates: voting.candidates,
    };
  },

  async getProgress(roomCode) {
    const room = await getRoom(roomCode);

    if (room.phase !== "VOTING") {
      throw new Error("Voting is not active.");
    }

    const voting = getVotingState(room);
    const eligiblePlayers = getEligiblePlayers(room);

    const votes = await gameRepository.getVotes(
      room.id,
      room.currentRoundNumber,
      voting.attempt,
    );

    return {
      phase: room.phase,
      round: room.currentRoundNumber,
      votingRound: room.currentRoundNumber,
      attempt: voting.attempt,
      status: voting.status,
      votingStatus: voting.status,
      totalEligible: eligiblePlayers.length,
      votesSubmitted: votes.length,
      counts: tallyVotes(
        votes,
        eligiblePlayers,
        voting.candidates,
      ),
    };
  },

  async endVoting(roomCode) {
    const room = await getRoom(roomCode);

    if (room.status !== "PLAYING" || room.phase !== "VOTING") {
      throw new Error("Voting is not active.");
    }

    const voting = getVotingState(room);

    if (voting.status !== "OPEN") {
      throw new Error("Voting has already ended for this attempt.");
    }

    const eligiblePlayers = getEligiblePlayers(room);
    const votes = await gameRepository.getVotes(
      room.id,
      room.currentRoundNumber,
      voting.attempt,
    );

    if (votes.length !== eligiblePlayers.length) {
      throw new Error(
        "Every living player must vote before God ends voting.",
      );
    }

    const counts = tallyVotes(
      votes,
      eligiblePlayers,
      voting.candidates,
    );

    const highestCount = counts[0]?.count ?? 0;

    if (highestCount === 0) {
      throw new Error("No votes were submitted.");
    }

    const leaders = counts.filter(
      (item) => item.count === highestCount,
    );

    if (leaders.length > 1) {
      const updatedState = {
        ...(room.nightState ?? {}),
        voting: {
          ...voting,
          status: "TIE",
          tiedCandidates: leaders.map((item) => item.playerId),
          finalCounts: counts,
        },
      };

      const update = await gameRepository.updateVotingState(
        room.id,
        room.currentRoundNumber,
        voting.attempt,
        "OPEN",
        updatedState,
      );

      if (update.count !== 1) {
        throw new Error("Voting state changed. Refresh and try again.");
      }

      return {
        outcome: "TIE",
        phase: "VOTING",
        round: room.currentRoundNumber,
        votingRound: room.currentRoundNumber,
        attempt: voting.attempt,
        counts,
      };
    }

    const winner = leaders[0];

    const result =
      await gameRepository.eliminatePlayerAndStartNextNight(
        room.id,
        room.currentRoundNumber,
        winner.playerId,
        { ...INITIAL_NIGHT_STATE },
      );

    if (result.count !== 1) {
      throw new Error("Voting was already resolved.");
    }

    return {
      outcome: result.gameResult ? "GAME_OVER" : "ELIMINATED",
      phase: result.gameResult ? "FINISHED" : "NIGHT",
      round: result.gameResult
        ? room.currentRoundNumber
        : room.currentRoundNumber + 1,
      votingRound: room.currentRoundNumber,
      attempt: voting.attempt,
      eliminatedPlayerId: winner.playerId,
      eliminatedUsername: winner.username,
      counts,
      gameResult: result.gameResult ?? null,
    };
  },

  async revote(roomCode) {
    const room = await getRoom(roomCode);

    if (room.status !== "PLAYING" || room.phase !== "VOTING") {
      throw new Error("A revote is only available after a tie.");
    }

    const voting = getVotingState(room);

    if (voting.status !== "TIE" || !voting.tiedCandidates?.length) {
      throw new Error("There is no tie to revote.");
    }

    const eligiblePlayers = getEligiblePlayers(room);

    const tiedCandidates = voting.tiedCandidates.filter((id) =>
      eligiblePlayers.some((player) => player.id === id),
    );

    if (tiedCandidates.length < 2) {
      throw new Error(
        "There are no longer enough tied candidates to revote.",
      );
    }

    const nextAttempt = voting.attempt + 1;

    const updatedState = {
      ...(room.nightState ?? {}),
      voting: {
        attempt: nextAttempt,
        candidates: tiedCandidates,
        status: "OPEN",
        tiedCandidates: [],
        finalCounts: [],
      },
    };

    const update = await gameRepository.updateVotingState(
      room.id,
      room.currentRoundNumber,
      voting.attempt,
      "TIE",
      updatedState,
    );

    if (update.count !== 1) {
      throw new Error("Voting state changed. Refresh and try again.");
    }

    return {
      outcome: "REVOTE",
      phase: "VOTING",
      round: room.currentRoundNumber,
      votingRound: room.currentRoundNumber,
      attempt: nextAttempt,
      candidates: tiedCandidates,
    };
  },

  async noElimination(roomCode) {
    const room = await getRoom(roomCode);

    if (room.status !== "PLAYING" || room.phase !== "VOTING") {
      throw new Error("No Elimination is only available after a tie.");
    }

    const voting = getVotingState(room);

    if (voting.status !== "TIE") {
      throw new Error("There is no tie to resolve.");
    }

    const result =
      await gameRepository.eliminatePlayerAndStartNextNight(
        room.id,
        room.currentRoundNumber,
        null,
        { ...INITIAL_NIGHT_STATE },
      );

    if (result.count !== 1) {
      throw new Error("Voting was already resolved.");
    }

    return {
      outcome: result.gameResult ? "GAME_OVER" : "NO_ELIMINATION",
      phase: result.gameResult ? "FINISHED" : "NIGHT",
      round: result.gameResult
        ? room.currentRoundNumber
        : room.currentRoundNumber + 1,
      votingRound: room.currentRoundNumber,
      attempt: voting.attempt,
      counts: voting.finalCounts ?? [],
      gameResult: result.gameResult ?? null,
    };
  },
};