
import { gameRepository } from "./game.repository.js";
import { gameService } from "./game.service.js";

export function registerGameSocket(io) {
    io.on("connection", (socket) => {

        socket.on("game:my-role", async (ack = () => { }) => {
            try {
                if (!socket.data.authenticated || !socket.data.session) {
                    return ack({
                        success: false,
                        message: "You must join the room first.",
                    });
                }

                const { roomCode, playerId } = socket.data.session;

                const player = await gameRepository.findPlayerRole(
                    roomCode,
                    playerId,
                );

                if (!player) {
                    return ack({
                        success: false,
                        message: "Player not found.",
                    });
                }
                if (player.room.status !== "PLAYING") {
                    return ack({
                        success: false,
                        message: "The host has not started the game yet.",
                    });
                }
                if (!player.role) {
                    return ack({
                        success: false,
                        message: "Your role has not been assigned yet.",
                    });
                }

                return ack({
                    success: true,
                    role: player.role,
                    isAlive: player.isAlive,
                    phase: player.room.phase,
                });
            } catch (error) {
                return ack({
                    success: false,
                    message: "Unable to retrieve your role.",
                });
            }
        });
        socket.on("game:start", async (ack = () => { }) => {
            try {
                if (
                    !socket.data.authenticated ||
                    !socket.data.session ||
                    !socket.data.isHost
                ) {
                    return ack({
                        success: false,
                        message: "Only God can start the game.",
                    });
                }

                const roomCode = socket.data.session.roomCode;
                const result = await gameService.startGame(roomCode);

                io.to(roomCode).emit("game:started", {
                    roomCode,
                    phase: result.phase,
                });

                return ack({
                    success: true,
                    ...result,
                });
            } catch (error) {
                return ack({
                    success: false,
                    message: error.message || "Could not start the game.",
                });
            }
        });
        socket.on("game:roles:assign", async (payload, ack = () => { }) => {
            try {
                console.log("[SERVER] game:roles:assign received");
                console.log("[SERVER] Authenticated:", socket.data.authenticated);
                console.log("[SERVER] Is host:", socket.data.isHost);
                console.log("[SERVER] Session:", socket.data.session);

                if (
                    !socket.data.authenticated ||
                    !socket.data.session ||
                    !socket.data.isHost
                ) {
                    console.log("[SERVER] Host validation failed");

                    return ack({
                        success: false,
                        message: "Only the host can assign roles.",
                    });
                }

                const roomCode = socket.data.session.roomCode;
                const { roles } = payload ?? {};

                const result = await gameService.assignRoles(roomCode, roles);

                console.log("[SERVER] Broadcasting roles assigned");
                console.log("[SERVER] Room code:", roomCode);
                console.log(
                    "[SERVER] Sockets in room:",
                    io.sockets.adapter.rooms.get(roomCode)?.size ?? 0,
                );

                io.to(roomCode).emit("game:roles:assigned", { roomCode });

                return ack({ success: true, ...result });
            } catch (error) {
                console.error("[SERVER] Assign roles error:", error);

                return ack({
                    success: false,
                    message: error.message || "Failed to assign roles.",
                });
            }


        });





    });
}
