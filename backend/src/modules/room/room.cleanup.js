import { roomRepository } from "./room.repository.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

async function cleanupExpiredRooms() {
  try {
    const cutoff = new Date(Date.now() - ONE_DAY_MS);

    const result = await roomRepository.deleteExpiredRooms(cutoff);

    if (result.count > 0) {
      console.log(
        `[ROOM CLEANUP] Deleted ${result.count} expired room(s).`,
      );
    }
  } catch (error) {
    console.error("[ROOM CLEANUP] Failed:", error);
  }
}

export function startRoomCleanup() {
 
  void cleanupExpiredRooms();


  const interval = setInterval(() => {
    void cleanupExpiredRooms();
  }, CLEANUP_INTERVAL_MS);

  interval.unref?.();

  console.log("[ROOM CLEANUP] Automatic cleanup enabled.");
}