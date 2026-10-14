
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useParams } from "react-router-dom";
import {
  Shield,
  Users,
  Shuffle,
  Eye,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

import api from "../services/api";
import { connectPlayerSocket } from "../services/socket";

const initialRoles = {
  mafia: 1,
  doctor: 1,
  police: 1,
  civilian: 1,
};

const roleLabels = {
  MAFIA: "Mafia",
  DOCTOR: "Doctor",
  POLICE: "Police",
  CIVILIAN: "Civilian",
};

export default function GodRoleAssign() {
  const { roomCode } = useParams();

  const [rolesAssigned, setRolesAssigned] = useState(false);
const [gameStarted, setGameStarted] = useState(false);
  const [session, setSession] = useState(null);
  const [socket, setSocket] = useState(null);
  const [room, setRoom] = useState(null);
  const [roles, setRoles] = useState(initialRoles);
  const [myRole, setMyRole] = useState(null);
  const [isAlive, setIsAlive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [nightStarted, setNightStarted] = useState(false);

  const totalRoles = Object.values(roles).reduce(
    (total, count) => total + Number(count || 0),
    0,
  );

 const players = room?.players ?? [];
const playablePlayers = players.filter((player) => !player.isHost);

const hostPlayer = players.find((player) => player.isHost);

const isHost = Boolean(
  session &&
    room &&
    (
      room.hostPlayerId === session.playerId ||
      hostPlayer?.id === session.playerId
    )
);

const hostStatusKnown = Boolean(
  session &&
    room &&
    (room.hostPlayerId || hostPlayer)
);
  const refreshRoom = useCallback(async () => {
    try {
      const response = await api.get(
        `/rooms/${encodeURIComponent(roomCode)}`,
      );

      const data = response.data?.room ?? response.data?.data ?? response.data;

      setRoom(data);
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not load the room.",
      );
    }
  }, [roomCode]);

const navigate = useNavigate();


useEffect(() => {
  if (loading || !session || !room || !hostStatusKnown) {
    return;
  }

  if (!isHost) {
    navigate(`/room/${roomCode}/reveal`, { replace: true });
  }
}, [
  loading,
  session,
  room,
  hostStatusKnown,
  isHost,
  roomCode,
  navigate,
]);

useEffect(() => {
  let active = true;
  let currentSocket;

  async function initialize() {
    setLoading(true);
    setError("");

    try {
      const normalizedRoomCode = roomCode.toUpperCase();

      const storedSession = localStorage.getItem(
        `mafia_session_${normalizedRoomCode}`,
      );

      if (!storedSession) {
        throw new Error(
          "No saved session found. Join this room first.",
        );
      }

      const parsedSession = JSON.parse(storedSession);

      if (
        !parsedSession.roomCode ||
        !parsedSession.playerId ||
        !parsedSession.reconnectSecret
      ) {
        throw new Error(
          "Your saved session is incomplete. Rejoin the room.",
        );
      }

      if (!active) return;

      setSession(parsedSession);

      const response = await api.get(
        `/rooms/${encodeURIComponent(roomCode)}`,
      );

      if (!active) return;

      const data =
        response.data?.room ??
        response.data?.data ??
        response.data;

      setRoom(data);

      currentSocket = connectPlayerSocket(parsedSession);

      if (!currentSocket) {
        throw new Error("Could not initialize the game connection.");
      }

      setSocket(currentSocket);

      currentSocket.on("room:state", (updatedRoom) => {
        if (active) setRoom(updatedRoom);
      });

      currentSocket.on("session:restored", () => {
        if (active) setError("");
      });

      currentSocket.on("connect_error", (err) => {
        if (active) {
          setError(err.message || "Socket connection failed.");
        }
      });

      currentSocket.on("disconnect", () => {
        if (active) {
          setMessage("Connection lost. Reconnecting...");
        }
      });

      currentSocket.on("connect", () => {
        if (active) setMessage("");
      });

      // Connect only after the socket has been created.
      if (!currentSocket.connected) {
        currentSocket.connect();
      }
    } catch (err) {
      if (active) {
        setError(
          err.response?.data?.message ||
            err.message ||
            "Failed to initialize the game.",
        );
      }
    } finally {
      if (active) setLoading(false);
    }
  }

  initialize();

  return () => {
    active = false;

    if (currentSocket) {
      currentSocket.off("room:state");
      currentSocket.off("session:restored");
      currentSocket.off("connect_error");
      currentSocket.off("disconnect");
      currentSocket.off("connect");

     
    }
  };
}, [roomCode]);

  function updateRole(role, value) {
    setRoles((current) => ({
      ...current,
      [role]: Math.max(0, Number(value) || 0),
    }));
  }

  function emitWithAck(eventName, payload) {
    return new Promise((resolve, reject) => {
      if (!socket?.connected) {
        reject(new Error("Not connected to the game server."));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error("The server did not respond. Try again."));
      }, 8000);

      const callback = (response) => {
        clearTimeout(timeout);

        if (!response?.success) {
          reject(new Error(response?.message || "Action failed."));
          return;
        }

        resolve(response);
      };

      if (payload === undefined) {
        socket.emit(eventName, callback);
      } else {
        socket.emit(eventName, payload, callback);
      }
    });
  }

  async function assignManualRoles() {
    setError("");
    setMessage("");

    if (totalRoles !== playablePlayers.length) {
      setError(
        `Role counts total ${totalRoles}, but there are ${playablePlayers.length} playing participants.`,
      );
      return;
    }

    if (totalRoles < 4) {
      setError("At least 4 playing participants are required.");
      return;
    }

    setBusy(true);

    try {
      const response = await emitWithAck("game:roles:assign", {
        roles: {
          mafia: Number(roles.mafia),
          doctor: Number(roles.doctor),
          police: Number(roles.police),
          civilian: Number(roles.civilian),
        },
      });
setRolesAssigned(true);
setGameStarted(false);
      setMessage(
        `Roles assigned to ${response.assignedPlayerCount} players.`,
      );

      setMyRole(null);
      setRevealed(false);
      await refreshRoom();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

async function startGame() {
  setError("");
  setMessage("");
  setBusy(true);

  try {
    await emitWithAck("game:start");

    setGameStarted(true);
    setMessage("Game started. Players can now reveal their roles.");
  } catch (err) {
    setError(err.message);
  } finally {
    setBusy(false);
  }
}

async function startNightOne() {
  setError("");
  setMessage("");
  setBusy(true);

  try {
    await emitWithAck("game:night:start");

    setNightStarted(true);
    navigate(`/room/${roomCode}/god`, { replace: true });
  } catch (err) {
    setError(err.message);
  } finally {
    setBusy(false);
  }
}

  async function assignRandomRoles() {
    setError("");
    setMessage("");
    setBusy(true);

    try {
      const response = await emitWithAck("game:roles:random");
setRolesAssigned(true);
setGameStarted(false);
      setMessage(
        `Random roles assigned to ${response.assignedPlayerCount} players.`,
      );

      setMyRole(null);
      setRevealed(false);
      await refreshRoom();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function revealMyRole() {
    setError("");
    setBusy(true);

    try {
      const response = await emitWithAck("game:my-role");

      setMyRole(response.role);
      setIsAlive(response.isAlive);
      setRevealed(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <LoaderCircle className="animate-spin" size={28} />
        <span className="ml-3">Loading game...</span>
      </main>
    );
  }

  if (error && !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto mb-4 text-red-400" size={36} />
          <h1 className="text-xl font-semibold">Unable to open game</h1>
          <p className="mt-3 text-sm text-slate-400">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-indigo-400">
              Mafia
            </p>
            <h1 className="mt-2 text-3xl font-bold">
              {isHost ? "Role assignment" : "Your role"}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Room code: {roomCode}
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm">
            <span
              className={`h-2 w-2 rounded-full ${
                socket?.connected ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            {socket?.connected ? "Connected" : "Connecting"}
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {message && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            <CheckCircle2 size={18} />
            {message}
          </div>
        )}

        {isHost ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <div className="mb-6 flex items-center gap-3">
                <Shield className="text-indigo-400" size={24} />
                <div>
                  <h2 className="font-semibold">Configure roles</h2>
                  <p className="text-sm text-slate-400">
                    Set the roles for the playing participants.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {Object.entries(roles).map(([role, count]) => (
                  <div
                    key={role}
                    className="flex items-center justify-between gap-4"
                  >
                    <label
                      htmlFor={`role-${role}`}
                      className="capitalize text-slate-200"
                    >
                      {role}
                    </label>

                    <input
                      id={`role-${role}`}
                      type="number"
                      min="0"
                      max={role === "civilian" ? 50 : 20}
                      value={count}
                      onChange={(event) =>
                        updateRole(role, event.target.value)
                      }
                      className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-center outline-none focus:border-indigo-500"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-xl bg-slate-950 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Total roles</span>
                  <span
                    className={
                      totalRoles === playablePlayers.length
                        ? "font-semibold text-emerald-400"
                        : "font-semibold text-amber-400"
                    }
                  >
                    {totalRoles} / {playablePlayers.length}
                  </span>
                </div>
              </div>

<button
  onClick={assignManualRoles}
  disabled={
    busy ||
    !socket?.connected ||
    totalRoles !== playablePlayers.length ||
    totalRoles < 4
  }
  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 font-semibold transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
>
  {busy ? (
    <LoaderCircle className="animate-spin" size={18} />
  ) : (
    <Shield size={18} />
  )}
  Assign selected roles
</button>

<button
  onClick={assignRandomRoles}
  disabled={busy || !socket?.connected || playablePlayers.length < 4}
  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-3 font-semibold transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
>
  <Shuffle size={18} />
  Assign random roles
</button>

{rolesAssigned && !gameStarted && (
  <button
    onClick={startGame}
    disabled={busy || !socket?.connected}
    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
  >
    {busy ? (
      <LoaderCircle className="animate-spin" size={18} />
    ) : (
      <Shield size={18} />
    )}
    Start Game — Reveal Roles
  </button>
)}

{gameStarted && !nightStarted && (
  <button
    onClick={startNightOne}
    disabled={busy || !socket?.connected}
    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
  >
    {busy ? (
      <LoaderCircle className="animate-spin" size={18} />
    ) : (
      <Shield size={18} />
    )}
    Start Night 1
  </button>
)}

            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <div className="mb-5 flex items-center gap-3">
                <Users className="text-indigo-400" size={24} />
                <div>
                  <h2 className="font-semibold">Room participants</h2>
                  <p className="text-sm text-slate-400">
                    Individual roles remain private.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {players.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4"
                  >
                    <div>
                      <p className="font-medium">{player.username}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {player.isHost ? "Host" : "Player"}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        player.isConnected
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {player.isConnected ? "Online" : "Offline"}
                    </span>
                  </div>
                ))}

                {players.length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-500">
                    No participants found.
                  </p>
                )}
              </div>
            </section>
          </div>
        ) : (
          <section className="mx-auto max-w-xl rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400">
              <Shield size={32} />
            </div>

            <h2 className="mt-5 text-xl font-semibold">
              Your secret role
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Only your authenticated session can retrieve your role.
            </p>

            {!revealed ? (
              <button
                onClick={revealMyRole}
                disabled={busy || !socket?.connected}
                className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 font-semibold hover:bg-indigo-400 disabled:opacity-50"
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" size={18} />
                ) : (
                  <Eye size={18} />
                )}
                Reveal my role
              </button>
            ) : (
              <div className="mt-7 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-6">
                <p className="text-sm text-indigo-300">You are</p>
                <p className="mt-2 text-3xl font-bold">
                  {roleLabels[myRole] ?? myRole}
                </p>
                <p className="mt-3 text-sm text-slate-400">
                  Status: {isAlive ? "Alive" : "Eliminated"}
                </p>
                <button
                  onClick={() => setRevealed(false)}
                  className="mt-5 text-sm text-slate-400 underline hover:text-white"
                >
                  Hide role on screen
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
