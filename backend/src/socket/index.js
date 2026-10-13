import { registerRoomSocket } from "../modules/room/room.socket.js";

export function registerSocketHandlers(io) {
  const activeSockets = new Map();

  registerRoomSocket(io, activeSockets);
}