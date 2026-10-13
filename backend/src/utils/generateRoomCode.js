
import { randomInt } from "node:crypto";

const CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(length = 8) {
  let code = "";

  for (let i = 0; i < length; i++) {
    code += CHARACTERS[randomInt(CHARACTERS.length)];
  }

  return code;
}