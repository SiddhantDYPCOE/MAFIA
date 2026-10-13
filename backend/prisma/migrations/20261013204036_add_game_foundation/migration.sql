-- CreateEnum
CREATE TYPE "PlayerRole" AS ENUM ('MAFIA', 'DOCTOR', 'POLICE', 'CIVILIAN');

-- CreateEnum
CREATE TYPE "GamePhase" AS ENUM ('LOBBY', 'ROLE_ASSIGNMENT', 'NIGHT', 'DISCUSSION', 'VOTING', 'ELIMINATION', 'FINISHED');

-- AlterTable
ALTER TABLE "GameRoom" ADD COLUMN     "currentRoundNumber" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "phase" "GamePhase" NOT NULL DEFAULT 'LOBBY';

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "role" "PlayerRole";

-- CreateTable
CREATE TABLE "GameRound" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "phase" "GamePhase" NOT NULL DEFAULT 'NIGHT',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameRound_roomId_phase_idx" ON "GameRound"("roomId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "GameRound_roomId_roundNumber_key" ON "GameRound"("roomId", "roundNumber");

-- CreateIndex
CREATE INDEX "Player_roomId_role_idx" ON "Player"("roomId", "role");

-- AddForeignKey
ALTER TABLE "GameRound" ADD CONSTRAINT "GameRound_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "GameRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
