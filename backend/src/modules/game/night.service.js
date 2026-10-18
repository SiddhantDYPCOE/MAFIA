
import { gameRepository } from "./game.repository.js";

const INITIAL_NIGHT_STATE = {
  mafiaSelections: {},
  mafiaProposal: null,
  mafiaTarget: null,
  doctorSelection: null,
  doctorSave: null,
  policeSelection: null,
  policeCheck: null,
};

const ALLOW_DOCTOR_SELF_SAVE = true;

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

function getNightState(value) {
  return {
    ...INITIAL_NIGHT_STATE,
    ...(value ?? {}),
    mafiaSelections: value?.mafiaSelections ?? {},
    mafiaProposal: value?.mafiaProposal ?? null,
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

function getLivingMafia(room) {
  return room.players.filter(
    (player) =>
      !player.isHost &&
      player.isAlive &&
      player.role === "MAFIA",
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
    throw new Error(
      `Only living ${role.toLowerCase()} players can do this.`,
    );
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

  if (actingRole === "MAFIA" && target.role === "MAFIA") {
    throw new Error("Mafia cannot target another Mafia player.");
  }

  if (actingRole === "DOCTOR" && !ALLOW_DOCTOR_SELF_SAVE) {
    const doctor = room.players.find(
      (player) =>
        !player.isHost &&
        player.isAlive &&
        player.role === "DOCTOR",
    );

    if (doctor?.id === target.id) {
      throw new Error("Doctor self-save is disabled.");
    }
  }

  return target;
}

function createMafiaProposal(room, playerId, targetId, state) {
  const livingMafia = getLivingMafia(room);

  if (!livingMafia.some((player) => player.id === playerId)) {
    throw new Error("Only living Mafia members can propose a target.");
  }

  if (state.mafiaProposal) {
    throw new Error(
      "A Mafia target has already been proposed. Confirm or cancel it first.",
    );
  }

  const target = validateTarget(room, targetId, "MAFIA");
  const isSingleMafia = livingMafia.length === 1;

  state.mafiaSelections = {
    [playerId]: target.id,
  };

  state.mafiaProposal = {
    proposerId: playerId,
    targetId: target.id,
    confirmations: [playerId],
    accepted: isSingleMafia,
  };

  // One living Mafia member does not need another confirmation.
  state.mafiaTarget = isSingleMafia ? target.id : null;

  return target;
}

async function getNightRoom(roomCode) {
  const room = await gameRepository.findNightRoom(roomCode);

  if (!room) throw new Error("Room not found.");

  if (room.status !== "PLAYING" || room.phase !== "NIGHT") {
    throw new Error("The room is not in the night phase.");
  }

  return room;
}

export const nightService = {
  async startNight(roomCode) {
    const room = await gameRepository.findNightRoom(roomCode);

    if (!room) {
      throw new Error("Room not found.");
    }

    if (
      room.status !== "PLAYING" ||
      room.phase !== "ROLE_ASSIGNMENT"
    ) {
      throw new Error(
        "Night 1 can only start after role assignment.",
      );
    }

    const players = room.players.filter(
      (player) => !player.isHost,
    );

    if (players.length < 4) {
      throw new Error("At least 4 playing participants are required.");
    }

    if (players.some((player) => !player.role)) {
      throw new Error("Assign roles to every player before starting.");
    }

    const result = await gameRepository.startNight(
      room.id,
      "ROLE_ASSIGNMENT",
      {
        status: "PLAYING",
        phase: "NIGHT",
        currentRoundNumber: 1,
        nightStep: "ALL_SLEEP",
        nightState: INITIAL_NIGHT_STATE,
      },
    );

    if (result.count !== 1) {
      throw new Error(
        "The game has already started. Refresh and try again.",
      );
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
      throw new Error(
        "Target selection is not available at this step.",
      );
    }

    requireLivingRole(room, playerId, config.role);

    if (step === "MAFIA_CHOOSE") {
      const result = await gameRepository.updateNightStateSafely(
        room.id,
        step,
        (latestRoom) => {
          const state = getNightState(latestRoom.nightState);

          createMafiaProposal(
            latestRoom,
            playerId,
            targetId,
            state,
          );

          return {
            nightState: state,
            selection: targetId,
          };
        },
      );

      return {
        step,
        selection: result.selection,
        mafiaProposal: result.nightState.mafiaProposal,
        mafiaTarget: result.nightState.mafiaTarget,
        policeResult: null,
      };
    }

    const target = validateTarget(room, targetId, config.role);
    const state = getNightState(room.nightState);

    if (step === "DOCTOR_CHOOSE") {
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
      throw new Error(
        "The night step changed. Refresh your screen.",
      );
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

  async submitMafiaDecision(roomCode, playerId, decision) {
    if (!["CONFIRM", "CANCEL"].includes(decision)) {
      throw new Error("Choose CONFIRM or CANCEL.");
    }

    const room = await getNightRoom(roomCode);

    if (room.nightStep !== "MAFIA_CHOOSE") {
      throw new Error("Mafia decisions are not available right now.");
    }

    requireLivingRole(room, playerId, "MAFIA");

    return gameRepository.updateNightStateSafely(
      room.id,
      "MAFIA_CHOOSE",
      (latestRoom) => {
        const state = getNightState(latestRoom.nightState);
        const proposal = state.mafiaProposal;

        if (!proposal) {
          throw new Error(
            "There is no active Mafia proposal. Select a target first.",
          );
        }

        const livingMafia = getLivingMafia(latestRoom);

        if (proposal.accepted || state.mafiaTarget) {
          throw new Error("The Mafia target has already been agreed.");
        }

        if (!livingMafia.some((player) => player.id === playerId)) {
          throw new Error("Only living Mafia members can decide.");
        }

        if (decision === "CANCEL") {
          // Any living Mafia member may reject the proposal.
          // All Mafia members can then propose again.
          state.mafiaProposal = null;
          state.mafiaTarget = null;
          state.mafiaSelections = {};

          return {
            nightState: state,
            decision,
            mafiaProposal: null,
            mafiaTarget: null,
          };
        }

        const confirmations = new Set(
          proposal.confirmations ?? [],
        );

        confirmations.add(playerId);

        const allConfirmed = livingMafia.every((player) =>
          confirmations.has(player.id),
        );

        state.mafiaProposal = {
          ...proposal,
          confirmations: [...confirmations],
          accepted: allConfirmed,
        };

        if (allConfirmed) {
          // Only unanimous confirmation locks the final target.
          validateTarget(
            latestRoom,
            proposal.targetId,
            "MAFIA",
          );

          state.mafiaTarget = proposal.targetId;
        }

        return {
          nightState: state,
          decision,
          mafiaProposal: state.mafiaProposal,
          mafiaTarget: state.mafiaTarget,
        };
      },
    );
  },

  async advanceNight(roomCode, expectedStep, godTargetId) {
    const room = await getNightRoom(roomCode);

    if (room.nightStep !== expectedStep) {
      throw new Error(
        "The night step has changed. Refresh and try again.",
      );
    }

    const state = getNightState(room.nightState);

    if (CHOOSE_CONFIG[expectedStep]) {
      const config = CHOOSE_CONFIG[expectedStep];
      let targetId = godTargetId;

      if (expectedStep === "MAFIA_CHOOSE") {
        // God cannot bypass Mafia agreement or supply a replacement target.
        if (!state.mafiaProposal?.accepted || !state.mafiaTarget) {
          throw new Error(
            "The Mafia must agree on a target before God can continue.",
          );
        }

        targetId = state.mafiaTarget;
      } else if (!targetId) {
        targetId =
          expectedStep === "DOCTOR_CHOOSE"
            ? state.doctorSelection
            : state.policeSelection;
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
      throw new Error(
        "The night can only end after the final night step.",
      );
    }

    const state = getNightState(room.nightState);

    const mafiaTargetId = state.mafiaTarget ?? null;
    const doctorSaveId =
      state.doctorSave ??
      state.doctorSelection ??
      null;

    if (hasLivingRole(room, "MAFIA") && !mafiaTargetId) {
      throw new Error(
        "The Mafia must agree on a target before the night can end.",
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
      throw new Error(
        "The night has already ended. Refresh and try again.",
      );
    }

    const eliminatedPlayer = killedPlayerId
      ? room.players.find((player) => player.id === killedPlayerId)
      : null;

    return {
      phase: result.gameResult ? "FINISHED" : "DISCUSSION",
      round: room.currentRoundNumber,
      eliminatedPlayerId: killedPlayerId,
      eliminatedUsername: eliminatedPlayer?.username ?? null,
      savedPlayerId: killedPlayerId ? null : mafiaTargetId,
      announcement: killedPlayerId ? "ELIMINATED" : "NO_DEATH",
      gameResult: result.gameResult ?? null,
    };
  },
};
