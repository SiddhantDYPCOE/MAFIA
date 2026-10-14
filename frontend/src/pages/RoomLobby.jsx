import { useCallback, useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  LoaderCircle,
  Moon,
  Shield,
  Trash2,
  Users,
  Wifi,
  WifiOff,
  Swords,
} from "lucide-react";

import { connectPlayerSocket } from "../services/socket";
import { deleteRoom, getRoom } from "../services/room.api";

export default function RoomLobby() {
  const { roomCode: routeRoomCode } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const roomCode = (routeRoomCode || "").toUpperCase();
  const sessionKey = `mafia_session_${roomCode}`;

  const socketRef = useRef(null);

  const [room, setRoom] = useState(location.state?.room ?? null);
  const [currentPlayer, setCurrentPlayer] = useState(
    location.state?.player ?? null,
  );
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(!location.state?.room);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [socketStatus, setSocketStatus] = useState("connecting");

  const players = room?.players ?? [];
  const host = players.find((player) => player.isHost);
  const isHost = Boolean(currentPlayer?.isHost);
  const gameStarted = room?.phase === "ROLE_ASSIGNMENT" ||
    room?.phase === "NIGHT" ||
    room?.phase === "DISCUSSION" ||
    room?.phase === "VOTING" ||
    room?.phase === "ELIMINATION" ||
    room?.phase === "FINISHED" ||
    room?.status === "PLAYING" ||
    room?.status === "FINISHED";

  const updateRoom = useCallback(
    (updatedRoom, playerId) => {
      if (!updatedRoom) return;

      if (updatedRoom.code?.toUpperCase() !== roomCode) return;

      setRoom(updatedRoom);

      const updatedPlayer = updatedRoom.players?.find(
        (player) => player.id === playerId,
      );

      if (updatedPlayer) {
        setCurrentPlayer(updatedPlayer);
      }
    },
    [roomCode],
  );

  useEffect(() => {
    let cancelled = false;
    let socket;

    const handleRoomState = (updatedRoom) => {
      if (cancelled) return;

      let session;

      try {
        const raw = localStorage.getItem(sessionKey);
        session = raw ? JSON.parse(raw) : null;
      } catch {
        session = null;
      }

      updateRoom(updatedRoom, session?.playerId);
    };

    async function initializeLobby() {
      try {
        setLoading(true);
        setError("");

        if (!roomCode) {
          throw new Error("Invalid room code.");
        }

        const fetchedRoom = await getRoom(roomCode);

        if (!fetchedRoom) {
          throw new Error("Room details were not returned by the server.");
        }

        if (cancelled) return;

        let session;

        try {
          const rawSession = localStorage.getItem(sessionKey);
          session = rawSession ? JSON.parse(rawSession) : null;
        } catch {
          session = null;
        }

        const isCurrentHost =
          fetchedRoom.hostPlayerId === session.playerId ||
          fetchedRoom.players?.some(
            (player) => player.id === session.playerId && player.isHost,
          );

        if (fetchedRoom.phase === "NIGHT") {
          navigate(
            isCurrentHost
              ? `/room/${roomCode}/god`
              : `/room/${roomCode}/round`,
            { replace: true },
          );
          return;
        }

        if (
          ["DISCUSSION", "VOTING", "ELIMINATION", "FINISHED"].includes(
            fetchedRoom.phase,
          )
        ) {
          navigate(
            isCurrentHost
              ? `/room/${roomCode}/god`
              : `/room/${roomCode}/round`,
            { replace: true },
          );
          return;
        }

        // ROLE_ASSIGNMENT must remain on the role reveal screen.
        if (fetchedRoom.phase === "ROLE_ASSIGNMENT") {
          navigate(
            isCurrentHost
              ? `/room/${roomCode}/roles`
              : `/room/${roomCode}/reveal`,
            { replace: true },
          );
          return;
        }

        if (
          ["DISCUSSION", "VOTING", "ELIMINATION", "FINISHED"].includes(
            fetchedRoom.phase,
          ) ||
          fetchedRoom.status === "PLAYING" ||
          fetchedRoom.status === "FINISHED"
        ) {
          navigate(
            fetchedRoom.hostPlayerId === session.playerId
              ? `/room/${roomCode}/god`
              : `/room/${roomCode}/round`,
            { replace: true },
          );
          return;
        }

        socket = connectPlayerSocket(session);
        socketRef.current = socket;

        const handleConnect = () => {
          if (cancelled) return;
          setSocketStatus("connected");
          setError("");
        };

        const handleSessionRestored = (data) => {
          if (cancelled) return;

          if (
            data?.roomCode?.toUpperCase() !== roomCode ||
            data?.playerId !== session.playerId
          ) {
            return;
          }

          setSocketStatus("connected");
          setError("");
        };

        const handleRolesAssigned = (data) => {
          if (cancelled) return;

          if (data?.roomCode?.toUpperCase() !== roomCode) return;

          const player = fetchedRoom.players?.find(
            (item) => item.id === session.playerId,
          );

          if (player?.isHost) return;

          navigate(`/room/${roomCode}/reveal`, { replace: true });
        };

        const handleGameStarted = (data) => {
          if (cancelled) return;

          if (data?.roomCode?.toUpperCase() !== roomCode) return;

          const player = fetchedRoom.players?.find(
            (item) => item.id === session.playerId,
          );

          if (player?.isHost) return;

          navigate(`/room/${roomCode}/reveal`, { replace: true });
        };

        const handleNightPhaseChanged = (data) => {
          if (cancelled || !data) return;

          if (data.phase !== "NIGHT") return;

          const player = fetchedRoom.players?.find(
            (item) => item.id === session.playerId,
          );

          navigate(
            player?.isHost
              ? `/room/${roomCode}/god`
              : `/room/${roomCode}/round`,
            { replace: true },
          );
        };
        const handleDisconnect = () => {
          if (!cancelled) setSocketStatus("disconnected");
        };

        const handleConnectError = (err) => {
          if (cancelled) return;

          setSocketStatus("disconnected");
          setError(err.message || "Unable to connect to the live lobby.");
        };

        socket.on("connect", handleConnect);
        socket.on("session:restored", handleSessionRestored);
        socket.on("room:state", handleRoomState);
        socket.on("game:roles:assigned", handleRolesAssigned);
        socket.on("game:started", handleGameStarted);
        socket.on("game:night:phase-changed", handleNightPhaseChanged);
        socket.on("disconnect", handleDisconnect);
        socket.on("connect_error", handleConnectError);

        socket.connect();
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.message ||
            err.message ||
            "Unable to load this room.",
          );
          setSocketStatus("disconnected");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    initializeLobby();

    return () => {
      cancelled = true;

      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [roomCode, sessionKey, navigate, updateRoom]);

  const copyInvite = async () => {
    const inviteUrl = `${window.location.origin}/room/${roomCode}`;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(
        "Could not copy the invite link. Please copy the URL manually.",
      );
    }
  };

  const handleDeleteLobby = async () => {
    if (!isHost || deleting) return;

    const confirmed = window.confirm(
      "Delete this lobby permanently? All players will lose access to this room.",
    );

    if (!confirmed) return;

    setDeleting(true);
    setError("");

    try {
      const rawSession = localStorage.getItem(sessionKey);
      const session = rawSession ? JSON.parse(rawSession) : null;

      await deleteRoom(roomCode, session);

      localStorage.removeItem(sessionKey);

      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
      socketRef.current = null;

      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.message ||
        "Unable to delete the lobby.",
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        <LoaderCircle className="mr-3 animate-spin" size={20} />
        Loading room...
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-5 text-neutral-100">
        <div className="w-full max-w-md border border-neutral-800 bg-neutral-900 p-7">
          <Shield className="text-red-400" size={28} />
          <h1 className="mt-4 text-xl font-semibold">Unable to open room</h1>
          <p className="mt-2 text-sm text-neutral-400">{error}</p>

          <button
            onClick={() => navigate("/")}
            className="mt-6 border border-neutral-100 bg-neutral-100 px-5 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-300"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  const statusDot =
    socketStatus === "connected"
      ? "bg-emerald-400"
      : socketStatus === "disconnected"
        ? "bg-red-400"
        : "bg-amber-400";

  const statusText =
    socketStatus === "connected"
      ? "Live lobby"
      : socketStatus === "disconnected"
        ? "Disconnected"
        : "Connecting...";

  return (
    <div className="min-h-screen bg-neutral-950 px-5 py-6 text-neutral-100 sm:px-10">
      <header className="mx-auto flex max-w-5xl items-center justify-between border-b border-neutral-800 pb-5">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-neutral-400 transition hover:text-white"
        >
          <ArrowLeft size={16} />
          Leave lobby
        </Link>

        <div className="flex items-center gap-2">
          <Moon className="text-neutral-400" size={18} />
          <span className="text-sm font-semibold tracking-widest">MAFIA</span>
        </div>
      </header>

      <main className="mx-auto mt-10 max-w-5xl">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <div className="inline-flex items-center gap-2 text-sm text-neutral-400">
              <span className={`h-2 w-2 ${statusDot}`} />
              {statusText}
            </div>

            <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Lobby</h1>

            <p className="mt-2 text-neutral-500">
              Invite your friends. Trust them at your own risk.
            </p>
          </div>

          <div className="border border-neutral-800 bg-neutral-900 p-4 sm:min-w-64">
            <p className="text-xs text-neutral-500">Room code</p>

            <div className="mt-1 flex items-center justify-between gap-4">
              <span className="font-mono text-2xl font-semibold tracking-widest">
                {roomCode}
              </span>

              <button
                onClick={copyInvite}
                title="Copy invite link"
                className="border border-neutral-700 p-2 text-neutral-300 transition hover:border-neutral-300 hover:text-white"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <p className="mt-2 text-xs text-neutral-500">
              {copied
                ? "Invite link copied!"
                : "Share the link with your friends."}
            </p>
          </div>
        </div>

        {error && room && (
          <p
            role="alert"
            className="mt-5 border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
          <section className="border border-neutral-800 bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
              <div>
                <h2 className="font-semibold">Players</h2>
                <p className="mt-0.5 text-sm text-neutral-500">
                  Players currently in this room
                </p>
              </div>

              <div className="flex items-center gap-2 border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300">
                <Users size={15} />
                {players.length}
              </div>
            </div>

            <div>
              {players.map((player, index) => (
                <div
                  key={player.id}
                  className="flex items-center gap-4 border-b border-neutral-800 px-5 py-3.5 last:border-b-0"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-neutral-700 bg-neutral-950 font-semibold text-neutral-300">
                    {player.username?.charAt(0)?.toUpperCase() || "?"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{player.username}</p>

                      {player.isHost && (
                        <span className="inline-flex items-center gap-1 border border-amber-400/40 px-1.5 py-0.5 text-xs text-amber-300">
                          <Crown size={11} />
                          Host
                        </span>
                      )}

                      {currentPlayer?.id === player.id && (
                        <span className="border border-neutral-600 px-1.5 py-0.5 text-xs text-neutral-300">
                          You
                        </span>
                      )}
                    </div>

                    <p className="mt-0.5 text-xs text-neutral-500">
                      Player {index + 1}
                    </p>
                  </div>

                  <div
                    className={`flex shrink-0 items-center gap-1.5 text-xs ${player.isConnected
                      ? "text-emerald-400"
                      : "text-neutral-500"
                      }`}
                  >
                    {player.isConnected ? (
                      <Wifi size={14} />
                    ) : (
                      <WifiOff size={14} />
                    )}
                    {player.isConnected ? "Online" : "Offline"}
                  </div>
                </div>
              ))}

              {players.length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-neutral-500">
                  No players in this room yet.
                </p>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="border border-neutral-800 bg-neutral-900 p-5">
              <div className="flex items-center gap-2 text-amber-300">
                <Crown size={18} />
                <h2 className="font-semibold text-neutral-100">Your host</h2>
              </div>

              <p className="mt-3 text-sm text-neutral-200">
                {host?.username || "Waiting for host"}
              </p>

              <p className="mt-2 text-sm leading-6 text-neutral-500">
                The host assigns roles and controls the game.
              </p>
            </section>

            {isHost && !gameStarted && (
              <section className="border border-neutral-800 bg-neutral-900 p-5">
                <div className="flex items-center gap-2 text-neutral-300">
                  <Swords size={18} />
                  <h2 className="font-semibold text-neutral-100">
                    Ready to set the roles?
                  </h2>
                </div>

                <p className="mt-2 text-sm leading-6 text-neutral-500">
                  Configure Mafia, Doctor, Police, and Civilian roles before
                  the game starts.
                </p>

                <button
                  onClick={() =>
                    navigate(`/room/${roomCode}/roles`, {
                      state: { room, player: currentPlayer },
                    })
                  }
                  className="mt-4 flex w-full items-center justify-center gap-2 border border-neutral-100 bg-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-300"
                >
                  <Shield size={16} />
                  Assign Roles
                </button>
              </section>
            )}

            <section className="border border-neutral-800 bg-neutral-900 p-5">
              <div className="flex items-center gap-2 text-neutral-300">
                <Shield size={18} />
                <h2 className="font-semibold text-neutral-100">
                  Invite your crew
                </h2>
              </div>

              <p className="mt-2 text-sm leading-6 text-neutral-500">
                Send your friends this link so they can join your room.
              </p>

              <button
                onClick={copyInvite}
                className="mt-4 flex w-full items-center justify-center gap-2 border border-neutral-600 px-4 py-2.5 text-sm font-semibold text-neutral-100 transition hover:border-neutral-300 hover:bg-neutral-800"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied!" : "Copy invite link"}
              </button>
            </section>

            <div className="border border-neutral-800 px-4 py-2.5 text-center text-xs text-neutral-500">
              Room status: {room?.status || "LOBBY"}
              {room?.phase ? ` · ${room.phase}` : ""}
            </div>

            {isHost && (
              <section className="border border-red-500/30 bg-neutral-900 p-5">
                <div className="flex items-center gap-2 text-red-300">
                  <Trash2 size={18} />
                  <h2 className="font-semibold">Danger zone</h2>
                </div>

                <p className="mt-2 text-sm leading-6 text-neutral-500">
                  Permanently delete this lobby. All players will lose access.
                </p>

                <button
                  type="button"
                  onClick={handleDeleteLobby}
                  disabled={deleting}
                  className="mt-4 flex w-full items-center justify-center gap-2 border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleting ? (
                    <>
                      <LoaderCircle size={16} className="animate-spin" />
                      Deleting lobby...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      Delete Lobby
                    </>
                  )}
                </button>
              </section>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}