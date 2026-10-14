
import { z } from "zod";

export const assignRolesSchema = z
  .object({
    roomCode: z
      .string()
      .trim()
      .toUpperCase()
      .length(8),

    roles: z.object({
      mafia: z.number().int().min(1).max(20),
      doctor: z.number().int().min(0).max(20),
      police: z.number().int().min(0).max(20),
      civilian: z.number().int().min(0).max(50),
    }),
  })
  .superRefine((data, ctx) => {
    const totalRoles =
      data.roles.mafia +
      data.roles.doctor +
      data.roles.police +
      data.roles.civilian;

    if (totalRoles < 4) {
      ctx.addIssue({
        code: "custom",
        path: ["roles"],
        message: "At least 4 players are required to start the game.",
      });
    }

    if (data.roles.mafia >= totalRoles) {
      ctx.addIssue({
        code: "custom",
        path: ["roles", "mafia"],
        message: "The game must include at least one non-mafia player.",
      });
    }
  });

export const randomRolesSchema = z.object({
  roomCode: z
    .string()
    .trim()
    .toUpperCase()
    .length(8),
});
