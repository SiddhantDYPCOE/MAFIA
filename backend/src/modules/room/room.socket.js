import { roomService } from "./room.service.js";
import { roomRepository } from "./room.repository.js";
import { joinRoomSchema } from "./room.validation.js";



async function emitRoomState(io, roomCode) {
  const room = await roomRepository.findByCode(roomCode);

  if (!room) return;

  io.to(roomCode).emit(
    "room:state",
    roomService.toPublicRoom(room),
  );
  
}

export function registerRoomSocket(io, activeSockets) {
  io.on("connection", async (socket) => {
    const session = socket.data.session;

    if (session) {
      await socket.join(session.roomCode);

      const previousSocketId = activeSockets.get(
        session.playerId,
      );

      activeSockets.set(session.playerId, socket.id);

      await roomRepository.updateConnection(
        session.playerId,
        true,
      );
      // Disconnect an older connection for the same player.
      if (previousSocketId && previousSocketId !== socket.id) {
        io.sockets.sockets
          .get(previousSocketId)
          ?.disconnect(true);
      }

      socket.emit("session:restored", {
        roomCode: session.roomCode,
        playerId: session.playerId,
      });

      await emitRoomState(io, session.roomCode);
    }

    socket.on("room:join", async (payload, ack = () => {}) => {
      try {
        if (socket.data.authenticated || socket.data.session) {
          return ack({
            success: false,
            message: "This socket already has a session",
          });
        }

        const parsed = joinRoomSchema.safeParse(payload);

        if (!parsed.success) {
          return ack({
            success: false,
            message: "Invalid room code or username",
          });
        }

        const result = await roomService.joinRoom(
          parsed.data.roomCode,
          parsed.data.username,
        );

        const { session: newSession } = result;

        socket.data.authenticated = true;
        socket.data.session = {
          ...newSession,
          roomId: undefined,
          isHost: false,
          username: result.player.username,
        };

        await socket.join(newSession.roomCode);

        activeSockets.set(newSession.playerId, socket.id);

        ack({
          success: true,
          data: {
            player: result.player,
            session: newSession,
          },
        });

        await emitRoomState(io, newSession.roomCode);
      } catch (error) {
        ack({
          success: false,
          message: error.statusCode
            ? error.message
            : error.code === "P2002"
              ? "That username is already taken"
              : "Unable to join room",
        });
      }
    });

    socket.on("disconnect", async () => {
      const currentSession = socket.data.session;

      if (!currentSession) return;

      // An old connection must not mark a newer connection offline.
      if (
        activeSockets.get(currentSession.playerId) !== socket.id
      ) {
        return;
      }

      activeSockets.delete(currentSession.playerId);

      try {
        await roomRepository.updateConnection(
          currentSession.playerId,
          false,
        );

        await emitRoomState(io, currentSession.roomCode);
      } catch (error) {
        console.error("Failed to update player connection", error);
      }
    });
  });
}