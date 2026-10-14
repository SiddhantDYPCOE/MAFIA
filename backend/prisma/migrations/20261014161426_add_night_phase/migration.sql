-- CreateEnum
CREATE TYPE "NightStep" AS ENUM ('ALL_SLEEP', 'MAFIA_WAKE', 'MAFIA_CHOOSE', 'DOCTOR_WAKE', 'DOCTOR_CHOOSE', 'POLICE_WAKE', 'POLICE_CHOOSE', 'NIGHT_END');

-- AlterTable
ALTER TABLE "GameRoom" ADD COLUMN     "nightState" JSONB,
ADD COLUMN     "nightStep" "NightStep";

-- CreateIndex
CREATE INDEX "GameRoom_phase_idx" ON "GameRoom"("phase");

-- CreateIndex
CREATE INDEX "Player_roomId_isAlive_idx" ON "Player"("roomId", "isAlive");
