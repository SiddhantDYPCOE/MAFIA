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
  Activity,
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

  const activityLogKey = `mafia_activity_log_enabled_${(roomCode || "").toUpperCase()}`;

  const [activityLogEnabled, setActivityLogEnabled] = useState(
    () => localStorage.getItem(activityLogKey) === "true",
  );

  function toggleActivityLog() {
    const next = !activityLogEnabled;

    localStorage.setItem(activityLogKey, String(next));

    setActivityLogEnabled(next);

    // Notify other components in the same browser tab.
    window.dispatchEvent(
      new CustomEvent("mafia-activity-log-setting-changed", {
        detail: {
          roomCode: (roomCode || "").toUpperCase(),
          enabled: next,
        },
      }),
    );
  }

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
  const [localGamePhase, setLocalGamePhase] = useState("LOBBY");

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
      navigate(`/room/${roomCode}`, { replace: true });
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
      setLocalGamePhase("ROLE_ASSIGNMENT");
      setNightStarted(false);
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
      setLocalGamePhase("ROLE_ASSIGNMENT");
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
      setNightStarted(false);
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
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-100">
        <LoaderCircle className="animate-spin" size={26} />
        <span className="ml-3">Loading game...</span>
      </main>
    );
  }

  if (error && !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-neutral-100">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto mb-4 text-red-400" size={32} />
          <h1 className="text-xl font-semibold">Unable to open game</h1>
          <p className="mt-3 text-sm text-neutral-500">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-100 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-6">
          <div>
            <p className="text-sm font-semibold tracking-widest text-neutral-500">
              MAFIA
            </p>
            <h1 className="mt-2 text-3xl font-bold">
              {isHost ? "Role assignment" : "Your role"}
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              Room code: {roomCode}
            </p>
          </div>

          <div className="flex items-center gap-2 border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm text-neutral-300">
            <span
              className={`h-2 w-2 ${socket?.connected ? "bg-emerald-400" : "bg-amber-400"
                }`}
            />
            {socket?.connected ? "Connected" : "Connecting"}
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-5 border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {message && (
          <div className="mb-5 flex items-center gap-2 border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-300">
            <CheckCircle2 size={18} />
            {message}
          </div>
        )}

        {isHost ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <section className="border border-neutral-800 bg-neutral-900 p-6">
              <div className="mb-6 flex items-center justify-between gap-4 border border-neutral-800 bg-neutral-950 p-4">
                <div className="flex items-start gap-3">
                  <Activity
                    size={20}
                    className={
                      activityLogEnabled
                        ? "mt-0.5 text-emerald-400"
                        : "mt-0.5 text-neutral-500"
                    }
                  />

                  <div>
                    <p className="font-semibold">God activity log</p>

                    <p className="mt-1 text-sm text-neutral-500">
                      {activityLogEnabled
                        ? "Activity logging is enabled for your God screen."
                        : "Activity logging is disabled. Events won't be displayed."}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={activityLogEnabled}
                  onClick={toggleActivityLog}
                  className={`relative h-7 w-12 shrink-0 transition ${activityLogEnabled ? "bg-emerald-500" : "bg-neutral-700"
                    }`}
                  aria-label="Toggle God activity log"
                >
                  <span
                    className={`absolute top-1 h-5 w-5 bg-white transition-all ${activityLogEnabled ? "left-6" : "left-1"
                      }`}
                  />
                </button>
              </div>
              <div className="mb-6 flex items-center gap-3">
                <Shield className="text-neutral-300" size={22} />
                <div>
                  <h2 className="font-semibold">Configure roles</h2>
                  <p className="text-sm text-neutral-500">
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
                      className="capitalize text-neutral-200"
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
                      className="w-24 border border-neutral-700 bg-neutral-950 px-3 py-2 text-center outline-none focus:border-neutral-300"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-6 border border-neutral-800 bg-neutral-950 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Total roles</span>
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
  onClick={rolesAssigned ? startGame : assignManualRoles}
  disabled={
    busy ||
    !socket?.connected ||
    (!rolesAssigned &&
      (totalRoles !== playablePlayers.length || totalRoles < 4)) ||
    (rolesAssigned && gameStarted)
  }
  className="mt-5 flex w-full items-center justify-center gap-2 border border-neutral-100 bg-neutral-100 px-4 py-3 font-semibold text-neutral-950 transition hover:bg-neutral-300 disabled:cursor-not-allowed disabled:opacity-50"
>
  {busy ? (
    <LoaderCircle className="animate-spin" size={18} />
  ) : rolesAssigned ? (
    <Eye size={18} />
  ) : (
    <Shield size={18} />
  )}

  {rolesAssigned
    ? gameStarted
      ? "Game Started"
      : "Start Game — Reveal Roles"
    : "Assign selected roles"}
</button>
              <button
                onClick={assignRandomRoles}
                // disabled={busy || !socket?.connected || playablePlayers.length < 4}
                disabled
                className="mt-3 flex w-full items-center justify-center gap-2 border border-neutral-600 px-4 py-3 font-semibold transition hover:border-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Shuffle size={18} />
                Assign random roles
              </button>

             

              {gameStarted && !nightStarted && (
                <button
                  onClick={startNightOne}
                  disabled={busy || !socket?.connected}
                  className="mt-3 flex w-full items-center justify-center gap-2 border border-neutral-100 bg-neutral-100 px-4 py-3 font-semibold text-neutral-950 transition hover:bg-neutral-300 disabled:opacity-50"
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

            <section className="border border-neutral-800 bg-neutral-900">
              <div className="flex items-center gap-3 border-b border-neutral-800 px-6 py-5">
                <Users className="text-neutral-300" size={22} />
                <div>
                  <h2 className="font-semibold">Room participants</h2>
                  <p className="text-sm text-neutral-500">
                    Individual roles remain private.
                  </p>
                </div>
              </div>

              <div>
                {players.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between gap-3 border-b border-neutral-800 px-6 py-4 last:border-b-0"
                  >
                    <div>
                      <p className="font-medium">{player.username}</p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {player.isHost ? "Host" : "Player"}
                      </p>
                    </div>

                    <span
                      className={`border px-2 py-0.5 text-xs ${player.isConnected
                        ? "border-emerald-500/40 text-emerald-400"
                        : "border-neutral-700 text-neutral-500"
                        }`}
                    >
                      {player.isConnected ? "Online" : "Offline"}
                    </span>
                  </div>
                ))}

                {players.length === 0 && (
                  <p className="px-6 py-8 text-center text-sm text-neutral-500">
                    No participants found.
                  </p>
                )}
              </div>
            </section>
          </div>
        ) : (
          <section className="mx-auto max-w-xl border border-neutral-800 bg-neutral-900 p-8 text-center">

          </section>
        )}
      </div>
    </main>
  );
}