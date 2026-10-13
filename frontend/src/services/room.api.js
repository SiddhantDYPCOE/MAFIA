import api from "./api";



export async function getRoom(roomCode) {
  const response = await api.get(
    `/rooms/${roomCode.toUpperCase()}`
  );

  return response.data?.data?.room;
}

export async function deleteRoom(roomCode, session) {
  if (!session?.playerId || !session?.reconnectSecret) {
    throw new Error("Your saved player session was not found.");
  }

  const response = await api.delete(
    `/rooms/${roomCode.toUpperCase()}`,
    {
      data: {
        playerId: session.playerId,
        reconnectSecret: session.reconnectSecret,
      },
    }
  );

  return response.data;
}