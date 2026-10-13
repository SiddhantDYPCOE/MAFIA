import { io } from "socket.io-client";

const SOCKET_URL =
import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

export function connectPlayerSocket(session) {
if (
!session?.roomCode ||
!session?.playerId ||
!session?.reconnectSecret
) {
throw new Error("Invalid or missing player session.");
}

return io(SOCKET_URL, {
autoConnect: false,
withCredentials: true,
auth: {
roomCode: session.roomCode.toUpperCase(),
playerId: session.playerId,
reconnectSecret: session.reconnectSecret,
},
});
}

export function getSavedSession(roomCode) {
try {
const raw = sessionStorage.getItem(
`mafia_session_${roomCode.toUpperCase()}`
);


return raw ? JSON.parse(raw) : null;


} catch {
return null;
}
}
