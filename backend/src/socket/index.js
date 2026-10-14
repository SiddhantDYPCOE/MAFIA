import { registerGameSocket } from "../modules/game/game.socket.js";
import { registerNightSocket } from "../modules/game/night.socket.js";
import { registerRoomSocket } from "../modules/room/room.socket.js";

export function registerSocketHandlers(io) {
  const activeSockets = new Map();

  registerRoomSocket(io, activeSockets);
  registerGameSocket(io);
   registerNightSocket(io);
}