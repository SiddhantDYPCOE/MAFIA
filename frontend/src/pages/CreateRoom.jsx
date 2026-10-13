import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Crown,
  LoaderCircle,
  Moon,
  Users,
} from "lucide-react";
import api from "../services/api";

export default function CreateRoom() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setError("");

    const trimmedUsername = username.trim();

    if (trimmedUsername.length < 2 || trimmedUsername.length > 24) {
      setError("Username must be between 2 and 24 characters.");
      return;
    }

    try {
      setLoading(true);

      const response = await api.post("/rooms/create", {
        hostName: trimmedUsername,
      });

      const result = response.data;

      if (!result.success) {
        setError(result.message || "Unable to create room.");
        return;
      }

      const { room, session } = result.data;

      if (!room?.code || !session?.playerId || !session?.reconnectSecret) {
        setError("Invalid room session returned by the server.");
        return;
      }

      localStorage.setItem(
        `mafia_session_${room.code}`,
        JSON.stringify({
          roomCode: session.roomCode,
          playerId: session.playerId,
          reconnectSecret: session.reconnectSecret,
          role: "HOST",
          username: trimmedUsername,
        }),
      );

      navigate(`/room/${room.code}`, {
        state: {
          room,
          role: "HOST",
          username: trimmedUsername,
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
    <div className="min-h-screen bg-[#0B0A12] px-5 py-6 text-white sm:px-10">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-gray-400 transition hover:text-white"
      >
        <ArrowLeft size={18} />
        Back to home
      </Link>

      <main className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
        <div className="w-full rounded-3xl border border-white/10 bg-[#15131F] p-7 shadow-2xl sm:p-9">
          <div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600/15 text-violet-300">
            <Crown size={28} />
          </div>

          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">
            Create a private room
          </p>

          <h1 className="mt-3 text-3xl font-bold">
            Gather your crew.
          </h1>

          <p className="mt-3 text-sm leading-6 text-gray-400">
            Choose your host name to create a room and invite your friends.
          </p>

          <form onSubmit={handleCreateRoom} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="username"
                className="mb-2 block text-sm font-medium text-gray-300"
              >
                Your username
              </label>

              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your name"
                minLength={2}
                maxLength={24}
                autoComplete="nickname"
                required
                className="w-full rounded-xl border border-white/10 bg-[#0B0A12] px-4 py-3.5 text-white outline-none transition placeholder:text-gray-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3.5 font-semibold transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <LoaderCircle size={19} className="animate-spin" />
                  Creating room...
                </>
              ) : (
                <>
                  <Moon size={19} />
                  Create room
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-500">
            <Users size={15} />
            Invite friends with your room code.
          </div>
        </div>
      </main>
    </div>
  );
}

