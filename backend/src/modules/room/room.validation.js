
import { z } from "zod";

export const createRoomSchema = z.object({
  hostName: z.string().trim().min(1).max(24),
});

export const joinRoomSchema = z.object({
  roomCode: z.string().trim().toUpperCase().length(8),
  username: z.string().trim().min(1).max(24),
});

export const reconnectSchema = z.object({
  roomCode: z.string().trim().toUpperCase().length(8),
  playerId: z.string().min(1),
  reconnectSecret: z.string().min(32).max(128),
});

export const roomCodeParamsSchema = z.object({
  roomCode: z.string().trim().toUpperCase().length(8),
});


export const deleteRoomSchema = z.object({
  playerId: z.string().min(1),
  reconnectSecret: z.string().min(32).max(256),
});
