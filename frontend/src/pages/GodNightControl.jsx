
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  LoaderCircle,
  Moon,
  Shield,
  Users,
  Sun,
  Skull,
  CheckCircle2,
} from "lucide-react";
import { connectPlayerSocket } from "../services/socket";

const prompts = {
  ALL_SLEEP: { title: "All sleep", button: "Next" },
  MAFIA_WAKE: { title: "Mafia wake up", button: "Next" },
  MAFIA_CHOOSE: {
    title: "Mafia chooses a target",
    button: "Next",
  },
  DOCTOR_WAKE: { title: "Doctor wake up", button: "Next" },
  DOCTOR_CHOOSE: {
    title: "Doctor chooses someone to save",
    button: "Next",
  },
  POLICE_WAKE: {
    title: "Police wake up",
    button: "Next",
  },
  POLICE_CHOOSE: {
    title: "Police investigates a player",
    button: "Next",
  },
  NIGHT_END: {
    title: "Everyone wake up",
    button: "Reveal morning result",
  },
};

export default function GodNightControl() {
  const { roomCode: paramCode } = useParams();
  const roomCode = (paramCode || "").toUpperCase();
  const navigate = useNavigate();

  const [socket, setSocket] = useState(null);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nightResult, setNightResult] = useState(null);

  useEffect(() => {
    let active = true;
    let resultTimeout;
    let currentSocket;

    const handleGodState = (nextState) => {
      if (!active || !nextState) return;

      setState(nextState);
      setError("");

      if (nextState.phase === "VOTING") {
        navigate(`/room/${roomCode}/round`, { replace: true });
      }
    };

    const handlePhaseChanged = (data) => {
      if (!active || !data) return;

      setState((previous) =>
        previous
          ? {
              ...previous,
              phase: data.phase,
              round: data.round ?? previous.round,
            }
          : previous,
      );

      if (data.phase === "VOTING") {
        navigate(`/room/${roomCode}/round`, { replace: true });
      }
    };

    const handleNightResult = (result) => {
      if (!active || !result) return;

      clearTimeout(resultTimeout);
      setNightResult(result);

      resultTimeout = setTimeout(() => {
        if (active) setNightResult(null);
      }, 4000);
    };

    try {
      const raw = localStorage.getItem(`mafia_session_${roomCode}`);

      if (!raw) {
        setError("No saved session. Rejoin the room first.");
        return;
      }

      const session = JSON.parse(raw);
      currentSocket = connectPlayerSocket(session);

      currentSocket.on("game:night:god-state", handleGodState);
      currentSocket.on("game:night:phase-changed", handlePhaseChanged);
      currentSocket.on("game:night:result", handleNightResult);

      currentSocket.on("connect", () => {
        currentSocket.emit("game:night:get-state", (response) => {
          if (!active) return;

          if (!response?.success) {
            setError(
              response?.message || "Could not restore game state.",
            );
          }
        });
      });

      currentSocket.on("connect_error", (err) => {
        if (active) setError(err.message || "Connection failed.");
      });

      currentSocket.on("disconnect", () => {
        if (active) setError("Connection lost. Reconnecting...");
      });

      setSocket(currentSocket);
      currentSocket.connect();
    } catch {
      setError("Could not restore the room session.");
    }

    return () => {
      active = false;
      clearTimeout(resultTimeout);
      currentSocket?.removeAllListeners();
      currentSocket?.disconnect();
    };
  }, [roomCode, navigate]);

  function sendAction(eventName, payload) {
    if (!socket?.connected || busy) return;

    setBusy(true);
    setError("");

    const callback = (timeoutError, response) => {
      setBusy(false);

      if (timeoutError) {
        setError("The server did not respond. Please try again.");
        return;
      }

      if (!response?.success) {
        setError(response?.message || "Action failed.");
      }
    };

    if (payload === undefined) {
      socket.timeout(8000).emit(eventName, callback);
    } else {
      socket.timeout(8000).emit(eventName, payload, callback);
    }
  }

  if (error && !state) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="max-w-md text-center">
          <p className="text-red-300">{error}</p>
          <button
            onClick={() => navigate(`/room/${roomCode}`)}
            className="mt-4 text-sm text-slate-400 underline"
          >
            Return to room
          </button>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-3 bg-slate-950 text-white">
        <LoaderCircle className="animate-spin" />
        Loading night state...
      </main>
    );
  }

  const isPreNight = ["LOBBY", "ROLE_ASSIGNMENT"].includes(state.phase);
  const prompt = prompts[state.nightStep];
  const nightState = state.nightState ?? {};

  const getPlayerName = (playerId) =>
    state.players?.find((player) => player.id === playerId)?.username ??
    "Unknown player";

  const mafiaSelections = Object.entries(
    nightState.mafiaSelections ?? {},
  );

  const currentTargetId =
    state.nightStep === "MAFIA_CHOOSE"
      ? mafiaSelections.at(-1)?.[1] ?? null
      : state.nightStep === "DOCTOR_CHOOSE"
        ? nightState.doctorSelection
        : state.nightStep === "POLICE_CHOOSE"
          ? nightState.policeSelection
          : null;

  const isChooseStep = Boolean(state.nightStep?.endsWith("_CHOOSE"));

  const hasSelection =
    state.nightStep === "MAFIA_CHOOSE"
      ? mafiaSelections.length > 0
      : Boolean(currentTargetId);

  return (
    <main className="relative min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm uppercase tracking-[0.25em] text-indigo-400">
          Mafia · God controls
        </p>

        <h1 className="mt-3 text-3xl font-bold">
          {state.phase === "DISCUSSION"
            ? `Day ${state.round || 1}`
            : `Night ${state.round || 1}`}
        </h1>

        <p className="mt-2 text-slate-400">Room: {roomCode}</p>

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-red-500/10 p-4 text-red-300"
          >
            {error}
          </p>
        )}

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-8">
          <div className="flex items-center gap-3">
            {state.phase === "DISCUSSION" ? (
              <Sun className="text-amber-400" size={28} />
            ) : (
              <Moon className="text-indigo-400" size={28} />
            )}

            <div>
              <p className="text-sm text-slate-400">Current phase</p>
              <p className="font-semibold">{state.phase}</p>
            </div>
          </div>

          {isPreNight ? (
            <>
              <h2 className="mt-8 text-xl font-semibold">
                Ready to start?
              </h2>

              <p className="mt-2 text-slate-400">
                Make sure every playing participant has a role.
              </p>

              <button
                disabled={busy || !socket?.connected}
                onClick={() => sendAction("game:night:start")}
                className="mt-6 w-full rounded-xl bg-indigo-500 px-5 py-3 font-semibold hover:bg-indigo-400 disabled:opacity-50"
              >
                {busy ? "Starting..." : "Start Night 1"}
              </button>
            </>
          ) : state.phase === "NIGHT" && prompt ? (
            <>
              <h2 className="mt-8 text-2xl font-semibold">
                {prompt.title}
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                Round {state.round || 1} · Step {state.nightStep}
              </p>

              {isChooseStep && (
                <div className="mt-5 rounded-xl border border-indigo-500/20 bg-slate-950 p-4">
                  <h3 className="text-sm font-semibold text-slate-300">
                    Player selections
                  </h3>

                  {state.nightStep === "MAFIA_CHOOSE" ? (
                    mafiaSelections.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {mafiaSelections.map(([playerId, targetId]) => (
                          <div
                            key={playerId}
                            className="flex justify-between gap-3 text-sm"
                          >
                            <span className="text-slate-400">
                              {getPlayerName(playerId)}
                            </span>

                            <span className="font-medium text-indigo-300">
                              → {getPlayerName(targetId)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-amber-300">
                        Waiting for Mafia to select a target...
                      </p>
                    )
                  ) : currentTargetId ? (
                    <p className="mt-3 text-sm text-indigo-300">
                      {state.nightStep === "DOCTOR_CHOOSE"
                        ? "Doctor will save"
                        : "Police is investigating"}
                      : {getPlayerName(currentTargetId)}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-amber-300">
                      Waiting for the player to select a target...
                    </p>
                  )}
                </div>
              )}

              <button
                disabled={
                  busy ||
                  !socket?.connected ||
                  (isChooseStep && !hasSelection)
                }
                onClick={() =>
                  sendAction("game:night:advance", {
                    expectedStep: state.nightStep,
                  })
                }
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 font-semibold hover:bg-indigo-400 disabled:opacity-50"
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" size={18} />
                ) : (
                  <Shield size={18} />
                )}

                {busy ? "Please wait..." : prompt.button}
              </button>
            </>
          ) : state.phase === "DISCUSSION" ? (
            <>
              <h2 className="mt-8 text-2xl font-semibold">
                Day {state.round || 1} — Discussion
              </h2>

              <p className="mt-3 text-slate-400">
                Let the players discuss what happened during the night.
                Start voting when everyone is ready.
              </p>

              <button
                disabled={busy || !socket?.connected}
                onClick={() =>
                  sendAction("game:discussion:start-voting")
                }
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 px-5 py-3 font-semibold hover:bg-rose-400 disabled:opacity-50"
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" size={18} />
                ) : (
                  <Users size={18} />
                )}

                {busy ? "Starting..." : "Start Voting"}
              </button>
            </>
          ) : state.phase === "VOTING" ? (
            <>
              <h2 className="mt-8 text-xl font-semibold">
                Voting phase started
              </h2>

              <p className="mt-2 text-slate-400">
                Players can now prepare to cast their votes.
              </p>
            </>
          ) : (
            <p className="mt-8 text-slate-400">
              Waiting for the next phase.
            </p>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Users size={20} className="text-indigo-400" />
            Players
          </h2>

          <div className="mt-4 space-y-2">
            {(state.players ?? []).map((player) => (
              <div
                key={player.id}
                className="flex justify-between rounded-lg bg-slate-950 p-3"
              >
                <span
                  className={
                    player.isAlive
                      ? ""
                      : "text-slate-500 line-through"
                  }
                >
                  {player.username}
                </span>

                {!player.isAlive && (
                  <span className="text-xs text-red-400">
                    Eliminated
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {nightResult && (
        <div
          role="status"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 px-6 text-center backdrop-blur-md"
        >
          <div className="max-w-xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-indigo-400/30 bg-indigo-500/10">
              {nightResult.announcement === "NO_DEATH" ? (
                <CheckCircle2
                  size={34}
                  className="text-emerald-300"
                />
              ) : (
                <Skull size={34} className="text-rose-400" />
              )}
            </div>

            <p className="mt-6 text-sm uppercase tracking-[0.35em] text-indigo-400">
              The sun rises
            </p>

            {nightResult.announcement === "NO_DEATH" ? (
              <>
                <h2 className="mt-6 text-4xl font-black text-emerald-300 sm:text-5xl">
                  Nobody died!
                </h2>

                <p className="mt-5 text-lg text-slate-300">
                  The Mafia tried. The Doctor denied. Everyone lives
                  to argue another day.
                </p>
              </>
            ) : (
              <>
                <h2 className="mt-6 text-4xl font-black text-rose-400 sm:text-5xl">
                  A dark morning...
                </h2>

                <p className="mt-5 text-lg text-slate-300">
                  {nightResult.eliminatedUsername ||
                    "Someone"}{" "}
                  didn't make it to breakfast. Their secrets stay
                  buried... for now.
                </p>
              </>
            )}

            <p className="mt-8 animate-pulse text-sm text-slate-500">
              Daylight is breaking...
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
