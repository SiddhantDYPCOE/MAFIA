import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Eye, Shield, LoaderCircle, AlertCircle } from "lucide-react";
import { connectPlayerSocket } from "../services/socket";

const roleLabels = {
    MAFIA: "Mafia",
    DOCTOR: "Doctor",
    POLICE: "Police",
    CIVILIAN: "Civilian",
};

export default function PlayerRoleReveal() {
    const { roomCode: routeRoomCode } = useParams();
    const roomCode = (routeRoomCode || "").toUpperCase();
    const navigate = useNavigate();

    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    const [busy, setBusy] = useState(false);
    const [role, setRole] = useState(null);
    const [isAlive, setIsAlive] = useState(true);
    const [revealed, setRevealed] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        let currentSocket;

        try {
            const rawSession = localStorage.getItem(
                `mafia_session_${roomCode}`,
            );

            if (!rawSession) {
                setError("No saved session found. Please rejoin the room.");
                return;
            }

            const session = JSON.parse(rawSession);

            if (
                session.roomCode?.toUpperCase() !== roomCode ||
                !session.playerId ||
                !session.reconnectSecret
            ) {
                setError("Your saved session is invalid. Please rejoin the room.");
                return;
            }

            currentSocket = connectPlayerSocket(session);

            currentSocket.on("connect", () => {
                if (active) {
                    setConnected(true);
                    setError("");
                }
            });

            currentSocket.on("night:started", () => {
                if (active) {
                    navigate(`/room/${roomCode}/round`, { replace: true });
                }
            });

            const handleNightPhaseChanged = (data) => {
                if (data?.phase !== "NIGHT") return;

                navigate(`/room/${roomCode}/round`, { replace: true });
            };

            currentSocket.on("game:night:phase-changed", handleNightPhaseChanged);

            currentSocket.on("disconnect", () => {
                if (active) setConnected(false);
            });

            currentSocket.on("connect_error", (err) => {
                if (active) {
                    setConnected(false);
                    setError(err.message || "Unable to connect to the game.");
                }
            });

            setSocket(currentSocket);
            currentSocket.connect();
        } catch {
            setError("Could not restore your room session.");
        }

        return () => {
            active = false;
            currentSocket?.removeAllListeners();
            currentSocket?.disconnect();
        };
    }, [roomCode]);

    function revealRole() {
        if (!socket?.connected || busy) return;

        setBusy(true);
        setError("");

        const timeout = setTimeout(() => {
            setBusy(false);
            setError("The server did not respond. Please try again.");
        }, 8000);

        socket.emit("game:my-role", (response) => {
            clearTimeout(timeout);

            if (!response?.success) {
                setBusy(false);
                setError(
                    response?.message || "Your role has not been assigned yet.",
                );
                return;
            }

            setRole(response.role);
            setIsAlive(response.isAlive);
            setRevealed(true);
            setBusy(false);
        });
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8 text-white">
            <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400">
                    <Shield size={32} />
                </div>

                <p className="mt-5 text-sm font-medium uppercase tracking-[0.25em] text-indigo-400">
                    Mafia
                </p>

                <h1 className="mt-2 text-2xl font-bold">Your secret role</h1>

                <p className="mt-2 text-sm text-slate-400">
                    Room code: {roomCode}
                </p>

                <div className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-400">
                    <span
                        className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-amber-400"
                            }`}
                    />
                    {connected ? "Connected to game" : "Connecting to game..."}
                </div>

                {error && (
                    <div
                        role="alert"
                        className="mt-5 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-left text-sm text-red-300"
                    >
                        <AlertCircle size={18} className="mt-0.5 shrink-0" />
                        {error}
                    </div>
                )}

                {!revealed ? (
                    <>
                        <p className="mt-6 text-sm leading-6 text-slate-400">
                            The god has assigned the roles. Reveal yours when you're
                            ready, and keep it secret from the other players.
                        </p>

                        <button
                            onClick={revealRole}
                            disabled={!connected || busy}
                            className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 font-semibold transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {busy ? (
                                <LoaderCircle className="animate-spin" size={18} />
                            ) : (
                                <Eye size={18} />
                            )}
                            Reveal my role
                        </button>
                    </>
                ) : (
                    <div className="mt-7 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-6">
                        <p className="text-sm text-indigo-300">You are</p>
                        <h2 className="mt-2 text-3xl font-bold">
                            {roleLabels[role] ?? role}
                        </h2>
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

                <button
                    onClick={() => navigate(`/room/${roomCode}`)}
                    className="mt-6 text-sm text-slate-500 hover:text-white"
                >
                    Back to room
                </button>
            </section>
        </main>
    );
}