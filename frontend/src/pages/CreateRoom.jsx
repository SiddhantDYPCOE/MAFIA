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
          <Crown size={26} className="text-neutral-300" />

          <h1 className="mt-5 text-3xl font-bold">Gather your crew.</h1>

          <p className="mt-2 text-sm leading-6 text-neutral-500">
            Choose your host name to create a private room and invite your
            friends.
          </p>

          <form onSubmit={handleCreateRoom} className="mt-8 space-y-5">
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
                minLength={2}
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
                  Creating room...
                </>
              ) : (
                <>
                  <Moon size={18} />
                  Create room
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-neutral-500">
            <Users size={14} />
            Invite friends with your room code.
          </div>
        </div>
      </main>
    </div>
  );
}