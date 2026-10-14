
import { gameRepository } from "./game.repository.js";
import { nightService } from "./night.service.js";

function isAuthenticated(socket) {
  return Boolean(socket.data.authenticated && socket.data.session);
}

function requireGod(socket) {
  if (!isAuthenticated(socket) || socket.data.isHost !== true) {
    throw new Error("Only God can control the night.");
  }
}

function ackError(ack, error) {
  ack({
    success: false,
    message: error?.message || "Night action failed.",
  });
}

async function broadcastNightState(io, roomCode) {
  const room = await gameRepository.findNightRoom(roomCode).catch(() => null);

  // After voting starts, the room is no longer a night room.
  const currentRoom =
    room ??
    (await gameRepository.findRoomByCode(roomCode));

  if (!currentRoom) return;

  const publicState = {
    phase: currentRoom.phase,
    round: currentRoom.currentRoundNumber,
    players: currentRoom.players.map((player) => ({
      id: player.id,
      username: player.username,
      isHost: player.isHost,
      isAlive: player.isAlive,
      isConnected: player.isConnected,
    })),
  };

  io.to(roomCode).emit("game:night:public-state", publicState);

  const sockets = await io.in(roomCode).fetchSockets();
  const step = currentRoom.nightStep;
  const state = currentRoom.nightState ?? {};

  for (const client of sockets) {
    if (!isAuthenticated(client)) continue;

    if (client.data.isHost === true) {
      client.emit("game:night:god-state", {
        ...publicState,
        nightStep: step,
        nightState: state,
        policeResult: state.policeSelection
          ? {
              targetId: state.policeSelection,
              isMafia:
                currentRoom.players.find(
                  (player) => player.id === state.policeSelection,
                )?.role === "MAFIA",
            }
          : null,
      });

      continue;
    }

    const player = currentRoom.players.find(
      (item) => item.id === client.data.session.playerId,
    );

    if (!player || !player.isAlive || player.isHost) continue;

    const role = player.role;
    const allowedStep = {
      MAFIA: "MAFIA_CHOOSE",
      DOCTOR: "DOCTOR_CHOOSE",
      POLICE: "POLICE_CHOOSE",
    }[role];

    const roleIsActive =
      currentRoom.phase === "NIGHT" &&
      step === allowedStep;

    const privateState = {
      phase: currentRoom.phase,
      round: currentRoom.currentRoundNumber,
      actionEnabled: roleIsActive,
      selection: null,
    };

    if (role === "MAFIA") {
      privateState.selection =
        state.mafiaSelections?.[player.id] ?? null;

      privateState.selections = state.mafiaSelections ?? {};
    } else if (role === "DOCTOR") {
      privateState.selection = state.doctorSelection ?? null;
    } else if (role === "POLICE") {
      privateState.selection = state.policeSelection ?? null;

      if (roleIsActive && state.policeSelection) {
        privateState.policeResult = {
          targetId: state.policeSelection,
          isMafia:
            currentRoom.players.find(
              (item) => item.id === state.policeSelection,
            )?.role === "MAFIA",
        };
      }
    }

    client.emit("game:night:private-state", privateState);
  }
}

export function registerNightSocket(io) {
  io.on("connection", (socket) => {
    socket.on("game:night:get-state", async (ack = () => {}) => {
  try {
    if (!isAuthenticated(socket)) {
      throw new Error("You must rejoin the room to restore the game.");
    }

    const roomCode = socket.data.session.roomCode;

    await broadcastNightState(io, roomCode);

    ack({ success: true });
  } catch (error) {
    ackError(ack, error);
  }
});

    socket.on("game:night:start", async (ack = () => {}) => {
      try {
        requireGod(socket);

        const roomCode = socket.data.session.roomCode;
        const result = await nightService.startNight(roomCode);

        io.to(roomCode).emit("game:night:phase-changed", result);
        await broadcastNightState(io, roomCode);

        ack({ success: true, ...result });
      } catch (error) {
        ackError(ack, error);
      }
    });

    socket.on(
      "game:night:advance",
      async (payload = {}, ack = () => {}) => {
        try {
          requireGod(socket);

          const roomCode = socket.data.session.roomCode;
          const { expectedStep, targetId } = payload;

          if (!expectedStep) {
            throw new Error("Missing expected night step.");
          }

          
if (expectedStep === "NIGHT_END") {
  const result = await nightService.goToDiscussion(
    roomCode,
    expectedStep,
  );

  io.to(roomCode).emit("game:night:result", result);
  io.to(roomCode).emit("game:night:phase-changed", {
    phase: result.phase,
    round: result.round,
  });

  await broadcastNightState(io, roomCode);

  ack({ success: true, ...result });
  return;
}


          const result = await nightService.advanceNight(
            roomCode,
            expectedStep,
            targetId,
          );

          io.to(roomCode).emit("game:night:phase-changed", {
            phase: result.phase,
            round: result.round,
          });

          await broadcastNightState(io, roomCode);

          // Do not return nightState to a general client acknowledgement.
          ack({
            success: true,
            phase: result.phase,
            round: result.round,
            nightStep: result.nightStep,
          });
        } catch (error) {
          ackError(ack, error);
        }
      },
    );

    socket.on(
      "game:night:select-target",
      async (payload = {}, ack = () => {}) => {
        try {
          if (!isAuthenticated(socket) || socket.data.isHost === true) {
            throw new Error("Only a playing participant can submit this action.");
          }

          const roomCode = socket.data.session.roomCode;
          const playerId = socket.data.session.playerId;

          const result = await nightService.selectTarget(
            roomCode,
            playerId,
            payload.targetId,
          );

          await broadcastNightState(io, roomCode);

          // Only the selecting player's socket gets this acknowledgement.
          ack({
            success: true,
            selection: result.selection,
            ...(result.policeResult
              ? { policeResult: result.policeResult }
              : {}),
          });
        } catch (error) {
          ackError(ack, error);
        }
      },
    );

    
socket.on("game:night:voting", async (ack = () => {}) => {
  try {
    requireGod(socket);

    const roomCode = socket.data.session.roomCode;
    const result = await nightService.goToDiscussion(
      roomCode,
      "NIGHT_END",
    );

    io.to(roomCode).emit("game:night:result", result);
    io.to(roomCode).emit("game:night:phase-changed", {
      phase: result.phase,
      round: result.round,
    });

    await broadcastNightState(io, roomCode);
    ack({ success: true, ...result });
  } catch (error) {
    ackError(ack, error);
  }
});


socket.on("game:discussion:start-voting", async (ack = () => {}) => {
  try {
    requireGod(socket);

    const roomCode = socket.data.session.roomCode;
    const result = await nightService.startVoting(roomCode);

    io.to(roomCode).emit("game:night:phase-changed", result);
    await broadcastNightState(io, roomCode);

    ack({ success: true, ...result });
  } catch (error) {
    ackError(ack, error);
  }
});

  });
}
