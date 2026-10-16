import api from "./api";

export async function getRoom(roomCode) {
  const response = await api.get(
    `/rooms/${encodeURIComponent(roomCode.toUpperCase())}`,
  );

  return response.data?.data?.room;
}

export async function deleteRoom(roomCode, session) {
  if (!session?.playerId || !session?.reconnectSecret) {
    throw new Error("Your saved player session was not found.");
  }

  const response = await api.delete(
    `/rooms/${encodeURIComponent(roomCode.toUpperCase())}`,
    {
      data: {
        playerId: session.playerId,
        reconnectSecret: session.reconnectSecret,
      },
    },
  );

  return response.data;
}

export async function kickPlayer(roomCode, targetPlayerId, session) {
  if (!session?.playerId || !session?.reconnectSecret) {
    throw new Error("Your saved player session was not found.");
  }

  if (!targetPlayerId) {
    throw new Error("The player to kick was not specified.");
  }

  const response = await api.delete(
    `/rooms/${encodeURIComponent(roomCode.toUpperCase())}/players/${encodeURIComponent(targetPlayerId)}`,
    {
      data: {
        playerId: session.playerId,
        reconnectSecret: session.reconnectSecret,
      },
    },
  );

  return response.data?.data;
}