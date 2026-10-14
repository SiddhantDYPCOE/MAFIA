
import { roomService } from "../modules/room/room.service.js";

export async function socketAuth(socket, next) {
  try {
    const auth = socket.handshake.auth ?? {};

    // Allow unauthenticated connections for room:join.
    if (
      !auth.roomCode &&
      !auth.playerId &&
      !auth.reconnectSecret
    ) {
      socket.data.authenticated = false;
      socket.data.isHost = false;

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

    // Determine host privileges from the authenticated database session.
    socket.data.isHost = session.isHost === true;

    next();
  } catch {
    next(new Error("Session invalid or expired"));
  }
}
