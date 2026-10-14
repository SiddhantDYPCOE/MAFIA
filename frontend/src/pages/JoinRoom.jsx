import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  Moon,
  Users,
  ShieldCheck,
} from "lucide-react";
import api from "../services/api";

export default function JoinRoom() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    setError("");

    const trimmedUsername = username.trim();
    const trimmedRoomCode = roomCode.trim().toUpperCase();

    if (trimmedUsername.length < 1 || trimmedUsername.length > 24) {
      setError("Username must be between 1 and 24 characters.");
      return;
    }

    if (!/^[A-Z0-9]{8}$/.test(trimmedRoomCode)) {
      setError("Enter a valid 8-character room code.");
      return;
    }

    try {
      setLoading(true);

      const response = await api.post("/rooms/join", {
        roomCode: trimmedRoomCode,
        username: trimmedUsername,
      });

      const result = response.data;

      if (!result.success) {
        setError(result.message || "Unable to join room.");
        return;
      }

      const { player, session } = result.data;

      if (
        !player?.id ||
        !session?.roomCode ||
        !session?.playerId ||
        !session?.reconnectSecret
      ) {
        setError("The server returned an invalid player session.");
        return;
      }

      // Store the private session for this browser tab.
      localStorage.setItem(
        `mafia_session_${session.roomCode}`,
        JSON.stringify({
          roomCode: session.roomCode,
          playerId: session.playerId,
          reconnectSecret: session.reconnectSecret,
          role: "PLAYER",
          username: player.username,
        }),
      );

      navigate(`/room/${session.roomCode}`, {
        state: {
          player,
          username: player.username,
          role: "PLAYER",
        },
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not connect to the server. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 px-5 py-6 text-neutral-100 sm:px-10">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-neutral-400 transition hover:text-white"
      >
        <ArrowLeft size={16} />
        Back to home
      </Link>

      <main className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
        <div className="w-full border border-neutral-800 bg-neutral-900 p-7 sm:p-9">
          <Users size={26} className="text-neutral-300" />

          <h1 className="mt-5 text-3xl font-bold">Enter the game.</h1>

          <p className="mt-2 text-sm leading-6 text-neutral-500">
            Enter the room code your host shared with you and choose your
            player name.
          </p>

          <form onSubmit={handleJoinRoom} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="roomCode"
                className="mb-2 block text-sm font-medium text-neutral-300"
              >
                Room code
              </label>

              <input
                id="roomCode"
                type="text"
                value={roomCode}
                onChange={(e) =>
                  setRoomCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 8),
                  )
                }
                placeholder="e.g. 8P9SDFAB"
                maxLength={8}
                autoComplete="off"
                required
                className="w-full border border-neutral-700 bg-neutral-950 px-4 py-3 font-mono text-lg tracking-widest text-white outline-none transition placeholder:text-neutral-600 focus:border-neutral-300"
              />
            </div>

            <div>
              <label
                htmlFor="username"
                className="mb-2 block text-sm font-medium text-neutral-300"
              >
                Your username
              </label>

              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your name"
                minLength={1}
                maxLength={24}
                autoComplete="nickname"
                required
                className="w-full border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none transition placeholder:text-neutral-600 focus:border-neutral-300"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 border border-neutral-100 bg-neutral-100 px-5 py-3 font-semibold text-neutral-950 transition hover:bg-neutral-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <LoaderCircle size={18} className="animate-spin" />
                  Joining room...
                </>
              ) : (
                <>
                  Join room
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-neutral-500">
            <ShieldCheck size={14} />
            Your session is saved for reconnection.
          </div>
        </div>
      </main>
    </div>
  );
}