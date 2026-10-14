
import { gameRepository } from "./game.repository.js";

const ROLE_LIMITS = {
  MAFIA: 20,
  DOCTOR: 20,
  POLICE: 20,
  CIVILIAN: 50,
};

function shuffleArray(items) {
  const shuffled = [...items];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function buildRoleList(roles) {
  return [
    ...Array(roles.mafia).fill("MAFIA"),
    ...Array(roles.doctor).fill("DOCTOR"),
    ...Array(roles.police).fill("POLICE"),
    ...Array(roles.civilian).fill("CIVILIAN"),
  ];
}

function validateRoleCounts(roles, players) {
  const totalRoles =
    roles.mafia +
    roles.doctor +
    roles.police +
    roles.civilian;

  if (players.length < 4) {
    throw new Error("At least 4 players are required to start the game.");
  }

  if (totalRoles !== players.length) {
    throw new Error(
      `Role count must equal the number of players (${players.length}).`,
    );
  }

  if (roles.mafia < 1 || roles.mafia >= players.length) {
    throw new Error(
      "The game must have at least one mafia and one non-mafia player.",
    );
  }

  for (const [role, count] of Object.entries(roles)) {
    if (count > ROLE_LIMITS[role.toUpperCase()]) {
      throw new Error(`Too many players assigned to ${role}.`);
    }
  }

  if (players.some((player) => player.isHost)) {
    throw new Error(
      "The host cannot be assigned a playing role.",
    );
  }
}

function prepareAssignments(players, roles) {
  const playablePlayers = players.filter(
    (player) => !player.isHost,
  );

  validateRoleCounts(roles, playablePlayers);

  const roleList = shuffleArray(buildRoleList(roles));
  const shuffledPlayers = shuffleArray(playablePlayers);

  return shuffledPlayers.map((player, index) => ({
    playerId: player.id,
    role: roleList[index],
  }));
}

async function getLobby(roomCode) {
  const room = await gameRepository.findRoomByCode(roomCode);

  if (!room) {
    throw new Error("Room not found.");
  }

  if (room.status !== "LOBBY") {
    throw new Error("This room is no longer in the lobby.");
  }

  return room;
}

export const gameService = {
  async assignRoles(roomCode, roles) {
    const room = await getLobby(roomCode);
    const assignments = prepareAssignments(room.players, roles);

    await gameRepository.assignRoles(assignments);

    // Roles are assigned, but the game has not started yet.
    await gameRepository.updateRoom(room.id, {
      status: "LOBBY",
      phase: "ROLE_ASSIGNMENT",
    });

    return {
      message: "Roles assigned successfully.",
      assignedPlayerCount: assignments.length,
    };
  },

  async assignRandomRoles(roomCode) {
    const room = await getLobby(roomCode);

    const players = room.players.filter(
      (player) => !player.isHost,
    );

    if (players.length < 4) {
      throw new Error("At least 4 players are required.");
    }

    const mafia = Math.max(1, Math.floor(players.length / 4));
    const doctor = 1;
    const police = 1;
    const civilian = players.length - mafia - doctor - police;

    if (civilian < 1) {
      throw new Error("Not enough players for this role configuration.");
    }

    const roles = { mafia, doctor, police, civilian };
    const assignments = prepareAssignments(room.players, roles);

    await gameRepository.assignRoles(assignments);

    await gameRepository.updateRoom(room.id, {
      status: "LOBBY",
      phase: "ROLE_ASSIGNMENT",
    });

    return {
      message: "Random roles assigned successfully.",
      assignedPlayerCount: assignments.length,
      roleCounts: roles,
    };
  },

  async startGame(roomCode) {
  const room = await gameRepository.findRoomByCode(roomCode);

  if (!room) {
    throw new Error("Room not found.");
  }

  // Starting the game is valid only before Night 1.
  if (!["LOBBY", "ROLE_ASSIGNMENT"].includes(room.phase)) {
    throw new Error("The game has already progressed beyond role reveal.");
  }

  const players = room.players.filter((player) => !player.isHost);

  if (players.length < 4) {
    throw new Error("At least 4 playing participants are required.");
  }

  if (players.some((player) => !player.role)) {
    throw new Error("Assign roles to all players first.");
  }

  if (!players.some((player) => player.role === "MAFIA")) {
    throw new Error("At least one Mafia player is required.");
  }

  // Idempotent: repeated Start Game requests won't break the flow.
  await gameRepository.updateRoom(room.id, {
    status: "PLAYING",
    phase: "ROLE_ASSIGNMENT",
  });

  return {
    message: "Game started. Players can now reveal their roles.",
    phase: "ROLE_ASSIGNMENT",
  };
}
};
