
import { gameRepository } from "./game.repository.js";

const INITIAL_NIGHT_STATE = {
  mafiaSelections: {},
  mafiaTarget: null,
  doctorSelection: null,
  doctorSave: null,
  policeSelection: null,
  policeCheck: null,
};

const ORDER = [
  "ALL_SLEEP",
  "MAFIA_WAKE",
  "MAFIA_CHOOSE",
  "DOCTOR_WAKE",
  "DOCTOR_CHOOSE",
  "POLICE_WAKE",
  "POLICE_CHOOSE",
  "NIGHT_END",
];

const ROLE_STEPS = {
  MAFIA: ["MAFIA_WAKE", "MAFIA_CHOOSE"],
  DOCTOR: ["DOCTOR_WAKE", "DOCTOR_CHOOSE"],
  POLICE: ["POLICE_WAKE", "POLICE_CHOOSE"],
};

const CHOOSE_CONFIG = {
  MAFIA_CHOOSE: {
    role: "MAFIA",
    selectionKey: "mafiaSelections",
    finalKey: "mafiaTarget",
  },
  DOCTOR_CHOOSE: {
    role: "DOCTOR",
    selectionKey: "doctorSelection",
    finalKey: "doctorSave",
  },
  POLICE_CHOOSE: {
    role: "POLICE",
    selectionKey: "policeSelection",
    finalKey: "policeCheck",
  },
};

const ALLOW_DOCTOR_SELF_SAVE = false;

function getNightState(value) {
  return {
    ...INITIAL_NIGHT_STATE,
    ...(value ?? {}),
    mafiaSelections: value?.mafiaSelections ?? {},
  };
}

function hasLivingRole(room, role) {
  return room.players.some(
    (player) =>
      !player.isHost &&
      player.isAlive &&
      player.role === role,
  );
}

function getNextStep(room, currentStep) {
  let index = ORDER.indexOf(currentStep);

  if (index === -1) {
    throw new Error("Invalid night step.");
  }

  while (index < ORDER.length - 1) {
    index += 1;
    const candidate = ORDER[index];

    const role = Object.keys(ROLE_STEPS).find((key) =>
      ROLE_STEPS[key].includes(candidate),
    );

    if (!role || hasLivingRole(room, role)) {
      return candidate;
    }
  }

  return "NIGHT_END";
}

function requireHost(socket) {
  if (
    !socket.data.authenticated ||
    !socket.data.session ||
    socket.data.isHost !== true
  ) {
    throw new Error("Only God can control the night.");
  }
}

function requireLivingRole(room, playerId, role) {
  const player = room.players.find(
    (item) => item.id === playerId,
  );

  if (
    !player ||
    player.isHost ||
    !player.isAlive ||
    player.role !== role
  ) {
    throw new Error(`Only living ${role.toLowerCase()} players can do this.`);
  }

  return player;
}

function validateTarget(room, targetId, actingRole) {
  if (!targetId || typeof targetId !== "string") {
    throw new Error("Select a target first.");
  }

  const target = room.players.find(
    (player) =>
      player.id === targetId &&
      !player.isHost &&
      player.isAlive,
  );

  if (!target) {
    throw new Error("Target must be a living player.");
  }

  if (
    actingRole === "MAFIA" &&
    target.role === "MAFIA"
  ) {
    throw new Error("Mafia cannot target another Mafia player.");
  }

  if (
    actingRole === "DOCTOR" &&
    !ALLOW_DOCTOR_SELF_SAVE &&
    target.id === room.players.find(
      (player) => player.role === "DOCTOR" && player.isAlive,
    )?.id
  ) {
    throw new Error("Doctor self-save is disabled.");
  }

  return target;
}

async function getNightRoom(roomCode) {
  const room = await gameRepository.findNightRoom(roomCode);

  if (!room) throw new Error("Room not found.");

  if (room.phase !== "NIGHT") {
    throw new Error("The room is not in the night phase.");
  }

  return room;
}

export const nightService = {
  async startNight(roomCode) {
    const room = await gameRepository.findNightRoom(roomCode);

    if (!room) throw new Error("Room not found.");

   if (
  room.status !== "PLAYING" ||
  room.phase !== "ROLE_ASSIGNMENT"
) {
  throw new Error(
    "Night 1 can only start after the host starts the game and players reveal their roles."
  );
}

    const players = room.players.filter((player) => !player.isHost);

    if (players.length < 4) {
      throw new Error("At least 4 playing participants are required.");
    }

    if (players.some((player) => !player.role)) {
      throw new Error("Assign roles to every player before starting.");
    }

    const result = await gameRepository.startNight(room.id, "ROLE_ASSIGNMENT", {
      status: "PLAYING",
      phase: "NIGHT",
      currentRoundNumber: 1,
      nightStep: "ALL_SLEEP",
      nightState: INITIAL_NIGHT_STATE,
    });

    if (result.count !== 1) {
      throw new Error("The game has already started. Refresh and try again.");
    }

    return {
      phase: "NIGHT",
      round: 1,
      nightStep: "ALL_SLEEP",
    };
  },

  async selectTarget(roomCode, playerId, targetId) {
    const room = await getNightRoom(roomCode);
    const step = room.nightStep;
    const config = CHOOSE_CONFIG[step];

    if (!config) {
      throw new Error("Target selection is not available at this step.");
    }

    requireLivingRole(room, playerId, config.role);

    const target = validateTarget(room, targetId, config.role);
    const state = getNightState(room.nightState);

    if (step === "MAFIA_CHOOSE") {
      state.mafiaSelections[playerId] = target.id;
    } else if (step === "DOCTOR_CHOOSE") {
      state.doctorSelection = target.id;
    } else {
      state.policeSelection = target.id;
    }

    const result = await gameRepository.updateNightSelection(
      room.id,
      step,
      state,
    );

    if (result.count !== 1) {
      throw new Error("The night step changed. Refresh your screen.");
    }

    return {
      step,
      selection: target.id,
      policeResult:
        step === "POLICE_CHOOSE"
          ? { isMafia: target.role === "MAFIA" }
          : null,
    };
  },

  async advanceNight(roomCode, expectedStep, godTargetId) {
    const room = await getNightRoom(roomCode);

    if (room.nightStep !== expectedStep) {
      throw new Error("The night step has changed. Refresh and try again.");
    }

    const state = getNightState(room.nightState);

    if (CHOOSE_CONFIG[expectedStep]) {
      const config = CHOOSE_CONFIG[expectedStep];
      let targetId = godTargetId;

      if (!targetId) {
        if (expectedStep === "MAFIA_CHOOSE") {
          const selections = Object.values(state.mafiaSelections);
          targetId = selections[selections.length - 1] ?? null;
        } else if (expectedStep === "DOCTOR_CHOOSE") {
          targetId = state.doctorSelection;
        } else {
          targetId = state.policeSelection;
        }
      }

      if (!targetId) {
        throw new Error("Choose a target before continuing.");
      }

      const target = validateTarget(room, targetId, config.role);

      if (expectedStep === "MAFIA_CHOOSE") {
        state.mafiaTarget = target.id;
      } else if (expectedStep === "DOCTOR_CHOOSE") {
        state.doctorSave = target.id;
      } else {
        state.policeCheck = {
          targetId: target.id,
          isMafia: target.role === "MAFIA",
        };
      }
    }

    const nextStep = getNextStep(room, expectedStep);

    const result = await gameRepository.advanceNight(
      room.id,
      expectedStep,
      {
        nightStep: nextStep,
        nightState: state,
      },
    );

    if (result.count !== 1) {
      throw new Error("This step was already advanced.");
    }

    return {
      phase: "NIGHT",
      round: room.currentRoundNumber,
      previousStep: expectedStep,
      nightStep: nextStep,
      nightState: state,
    };
  },

  
async goToDiscussion(roomCode, expectedStep) {
  const room = await getNightRoom(roomCode);

  if (
    room.nightStep !== "NIGHT_END" ||
    expectedStep !== "NIGHT_END"
  ) {
    throw new Error("The night can only end after the final night step.");
  }

  const state = getNightState(room.nightState);

  const mafiaSelections = Object.values(state.mafiaSelections);

  const mafiaTargetId =
    state.mafiaTarget ??
    mafiaSelections[mafiaSelections.length - 1] ??
    null;

  const doctorSaveId =
    state.doctorSave ??
    state.doctorSelection ??
    null;

  if (hasLivingRole(room, "MAFIA") && !mafiaTargetId) {
    throw new Error(
      "The Mafia must select a target before the night can end.",
    );
  }

  const killedPlayerId =
    mafiaTargetId && mafiaTargetId !== doctorSaveId
      ? mafiaTargetId
      : null;

  state.mafiaTarget = mafiaTargetId;
  state.doctorSave = doctorSaveId;

  const result = await gameRepository.resolveNightAndStartDiscussion(
    room.id,
    state,
    killedPlayerId,
  );

  if (result.count !== 1) {
    throw new Error("The night has already ended. Refresh and try again.");
  }

  const eliminatedPlayer = killedPlayerId
    ? room.players.find((player) => player.id === killedPlayerId)
    : null;

  return {
    phase: "DISCUSSION",
    round: room.currentRoundNumber,
    eliminatedPlayerId: killedPlayerId,
    eliminatedUsername: eliminatedPlayer?.username ?? null,
    savedPlayerId: killedPlayerId ? null : mafiaTargetId,
    announcement: killedPlayerId
      ? "ELIMINATED"
      : "NO_DEATH",
  };
},

async startVoting(roomCode) {
  const room = await gameRepository.findRoomByCode(roomCode);

  if (!room) {
    throw new Error("Room not found.");
  }

  if (room.status !== "PLAYING" || room.phase !== "DISCUSSION") {
    throw new Error("Voting can only start during daytime discussion.");
  }

  const result = await gameRepository.startVotingFromDiscussion(room.id);

  if (result.count !== 1) {
    throw new Error("Voting has already started. Refresh and try again.");
  }

  return {
    phase: "VOTING",
    round: room.currentRoundNumber,
  };
},

};
