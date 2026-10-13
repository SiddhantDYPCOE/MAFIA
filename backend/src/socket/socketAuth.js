
import { roomService } from "../modules/room/room.service.js";

export async function socketAuth(socket, next) {
  try {
    const auth = socket.handshake.auth ?? {};

    // Allow unauthenticated sockets to connect only so they can
    // request a new seat through room:join.
    if (
      !auth.roomCode &&
      !auth.playerId &&
      !auth.reconnectSecret
    ) {
      socket.data.authenticated = false;
      return next();
    }

    if (
      !auth.roomCode ||
      !auth.playerId ||
      !auth.reconnectSecret
    ) {
      return next(new Error("Invalid session credentials"));
    }

    const session = await roomService.authenticateSession({
      roomCode: String(auth.roomCode).toUpperCase(),
      playerId: auth.playerId,
      reconnectSecret: auth.reconnectSecret,
    });

    socket.data.authenticated = true;
    socket.data.session = session;

    next();
  } catch {
    next(new Error("Session invalid or expired"));
  }
}