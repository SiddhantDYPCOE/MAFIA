
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  LoaderCircle,
  Moon,
  Shield,
  CheckCircle2,
  Target,
  Sun,
  Search,
  Skull,
} from "lucide-react";
import { connectPlayerSocket } from "../services/socket";

const roleActions = {
  MAFIA: {
    title: "Choose someone to eliminate",
    description: "Select the player the Mafia should target tonight.",
    button: "Confirm target",
  },
  DOCTOR: {
    title: "Choose someone to save",
    description: "You may protect yourself or another living player.",
    button: "Confirm save",
  },
  POLICE: {
    title: "Investigate a player",
    description:
      "Investigate living players one by one. Each result is private to you.",
    button: "Investigate player",
  },
};

export default function PlayerRound() {
  const { roomCode: paramCode } = useParams();
  const roomCode = (paramCode || "").toUpperCase();
  const navigate = useNavigate();

  const [socket, setSocket] = useState(null);
  const [state, setState] = useState(null);
  const [myRole, setMyRole] = useState(null);
  const [privateState, setPrivateState] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [nightResult, setNightResult] = useState(null);
  const [lastInvestigation, setLastInvestigation] = useState(null);

  useEffect(() => {
    let active = true;
    let currentSocket;
    let resultTimeout;

    try {
      const raw = localStorage.getItem(`mafia_session_${roomCode}`);

      if (!raw) {
        setError("No saved session. Rejoin the room first.");
      } else {
        const session = JSON.parse(raw);
        currentSocket = connectPlayerSocket(session);

        currentSocket.on("game:night:result", (result) => {
          if (!active || !result) return;

          clearTimeout(resultTimeout);
          setNightResult(result);

          resultTimeout = setTimeout(() => {
            if (active) setNightResult(null);
          }, 4000);
        });

        currentSocket.on("game:night:public-state", (nextState) => {
          if (!active || !nextState) return;

          setState(nextState);

          if (
            ["NIGHT", "DISCUSSION", "VOTING"].includes(nextState.phase)
          ) {
            navigate(`/room/${roomCode}/round`, { replace: true });
          }
        });

        currentSocket.on("game:night:private-state", (nextState) => {
          if (!active || !nextState) return;

          setPrivateState(nextState);

          // Do not force the previous Police target to remain selected.
          if (nextState.selection) {
            setSelectedTarget((previous) => previous || nextState.selection);
          }

          if (nextState.policeResult) {
            setLastInvestigation(nextState.policeResult);
          }
        });

        currentSocket.on("game:night:phase-changed", (data) => {
          if (!active || !data) return;

          if (["DISCUSSION", "VOTING"].includes(data.phase)) {
            setState((previous) =>
              previous
                ? {
                    ...previous,
                    phase: data.phase,
                    round: data.round ?? previous.round,
                  }
                : previous,
            );

            navigate(`/room/${roomCode}/round`, { replace: true });
          }
        });

        currentSocket.on("connect", () => {
          if (!active) return;

          setError("");

          currentSocket.emit("game:night:get-state", (response) => {
            if (!active) return;

            if (!response?.success) {
              setError(
                response?.message || "Unable to restore game state.",
              );
            }
          });

          currentSocket.emit("game:my-role", (response) => {
            if (!active) return;

            if (response?.success) {
              setMyRole(response.role);
            } else {
              setError(
                response?.message || "Unable to retrieve your role.",
              );
            }
          });
        });

        currentSocket.on("connect_error", (err) => {
          if (active) {
            setError(err.message || "Connection failed.");
          }
        });

        currentSocket.on("disconnect", () => {
          if (active) {
            setError("Connection lost. Reconnecting...");
          }
        });

        setSocket(currentSocket);
        currentSocket.connect();
      }
    } catch (err) {
      console.error("PlayerRound initialization failed:", err);
      setError("Could not restore your room session.");
    }

    return () => {
      active = false;
      clearTimeout(resultTimeout);
      currentSocket?.removeAllListeners();
      currentSocket?.disconnect();
    };
  }, [roomCode, navigate]);

  
function submitTarget() {
  if (
    !socket?.connected ||
    submitting ||
    !privateState?.actionEnabled ||
    !selectedTarget
  ) {
    return;
  }

  setSubmitting(true);
  setError("");
  setMessage("");

  socket.timeout(8000).emit(
    "game:night:select-target",
    { targetId: selectedTarget },
    (timeoutError, response) => {
      setSubmitting(false);

      if (timeoutError) {
        setError("The server did not respond. Please try again.");
        return;
      }

      if (!response?.success) {
        setError(response?.message || "Could not submit your selection.");
        return;
      }

      const submittedTarget = response.selection ?? selectedTarget;

      setPrivateState((previous) =>
        previous
          ? {
              ...previous,
              selection: submittedTarget,
              ...(response.policeResult
                ? { policeResult: response.policeResult }
                : {}),
              // Prevent another investigation this night.
              ...(myRole === "POLICE"
                ? { actionEnabled: false }
                : {}),
            }
          : previous,
      );

      setSelectedTarget(submittedTarget);

      if (myRole === "POLICE") {
        if (response.policeResult) {
          setLastInvestigation(response.policeResult);

          setMessage(
            response.policeResult.isMafia
              ? "Investigation complete: This player is Mafia."
              : "Investigation complete: This player is not Mafia.",
          );
        } else {
          setMessage("Investigation submitted successfully.");
        }
      } else {
        setMessage("Your selection has been submitted successfully.");
      }
    },
  );
}


  if (error && !state) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <p className="text-center text-red-300">{error}</p>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-3 bg-slate-950 text-white">
        <LoaderCircle className="animate-spin" />
        Restoring game...
      </main>
    );
  }

  const isNight = state.phase === "NIGHT";
  const isDiscussion = state.phase === "DISCUSSION";
  const isVoting = state.phase === "VOTING";
  const action = roleActions[myRole];

  const alivePlayers = (state.players ?? []).filter(
    (player) => player.isAlive && !player.isHost,
  );

  const canChooseTarget =
    isNight &&
    Boolean(action) &&
    Boolean(privateState?.actionEnabled) &&
    !submitting;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-xl">
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        {message && (
          <p
            role="status"
            className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300"
          >
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <span>{message}</span>
          </p>
        )}

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
          {isNight ? (
            <Moon className="mx-auto text-indigo-400" size={32} />
          ) : (
            <Sun className="mx-auto text-amber-400" size={32} />
          )}

          <h1 className="mt-4 text-2xl font-bold">
            {isNight
              ? "Night — everyone sleep"
              : isDiscussion
                ? `Day ${state.round || 1} — Discussion`
                : isVoting
                  ? "Voting phase"
                  : "Game"}
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Room {roomCode}
          </p>

          {myRole && (
            <p className="mt-3 text-sm text-indigo-300">
              Your role: {myRole}
            </p>
          )}

          {isNight && !canChooseTarget && (
            <p className="mt-4 text-sm text-slate-400">
              Stay quiet and wait for your turn.
            </p>
          )}

          {isDiscussion && (
            <p className="mt-4 text-sm leading-relaxed text-slate-300">
              Day has begun. Discuss your suspicions and wait for God to start
              voting.
            </p>
          )}

          {isVoting && (
            <p className="mt-4 text-sm text-slate-300">
              Voting phase has started.
            </p>
          )}
        </section>

        {canChooseTarget && (
          <section className="mt-6 rounded-2xl border border-indigo-500/30 bg-slate-900/80 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/10">
                {myRole === "POLICE" ? (
                  <Search className="text-indigo-400" size={23} />
                ) : myRole === "DOCTOR" ? (
                  <Shield className="text-indigo-400" size={23} />
                ) : (
                  <Target className="text-indigo-400" size={23} />
                )}
              </div>

              <div>
                <h2 className="font-semibold">{action.title}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {action.description}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {alivePlayers.map((player) => {
  const selected = selectedTarget === player.id;

  return (
    <button
      key={player.id}
      type="button"
      onClick={() => {
        setSelectedTarget(player.id);
        setMessage("");
        setError("");
      }}
      disabled={submitting}
      aria-pressed={selected}
      className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${
        selected
          ? "border-indigo-400 bg-indigo-500/15"
          : "border-slate-700 bg-slate-950 hover:border-slate-500"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <span className="font-medium">{player.username}</span>

      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full border ${
          selected
            ? "border-indigo-400 bg-indigo-500"
            : "border-slate-600"
        }`}
      >
        {selected && (
          <span className="h-2 w-2 rounded-full bg-white" />
        )}
      </span>
    </button>
  );
})}

              {alivePlayers.length === 0 && (
                <p className="text-sm text-slate-400">
                  No living players are available.
                </p>
              )}
            </div>

            {myRole === "DOCTOR" && (
              <p className="mt-3 text-xs text-slate-400">
                You can select your own name to attempt a self-save.
              </p>
            )}

            {myRole === "POLICE" && (
              <p className="mt-3 text-xs text-slate-400">
                Select a different player after each result to investigate
                them one by one.
              </p>
            )}

            <button
              type="button"
              onClick={submitTarget}
              disabled={
                submitting ||
                !socket?.connected ||
                !selectedTarget ||
                !canChooseTarget
              }
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 font-semibold transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && (
                <LoaderCircle className="animate-spin" size={18} />
              )}
              {submitting ? "Submitting..." : action.button}
            </button>

            {myRole !== "POLICE" && privateState?.selection && (
              <p className="mt-3 text-center text-xs text-slate-400">
                Your selection is submitted. You can change it while your
                action remains active.
              </p>
            )}
          </section>
        )}

        {myRole === "POLICE" && lastInvestigation && (
          <section className="mt-6 rounded-2xl border border-indigo-500/30 bg-slate-900/80 p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Search size={19} className="text-indigo-400" />
              Latest investigation
            </h2>

            <p
              className={`mt-3 text-sm ${
                lastInvestigation.isMafia
                  ? "text-red-300"
                  : "text-emerald-300"
              }`}
            >
              {lastInvestigation.isMafia
                ? "Your latest investigation indicates this player is Mafia."
                : "Your latest investigation indicates this player is not Mafia."}
            </p>

            <p className="mt-2 text-xs text-slate-500">
              This information is private to you.
            </p>
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Shield className="text-indigo-400" size={20} />
            Players
          </h2>

          <div className="mt-4 space-y-2">
            {(state.players ?? []).map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between rounded-lg bg-slate-950 p-3"
              >
                <span
                  className={
                    player.isAlive
                      ? "text-slate-100"
                      : "text-slate-500 line-through"
                  }
                >
                  {player.username}
                  {player.isHost ? " (God)" : ""}
                </span>

                {!player.isAlive && (
                  <span className="flex items-center gap-1 text-xs text-red-400">
                    <Skull size={13} />
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
          role="alert"
          aria-live="assertive"
          className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-slate-950/95 px-6 text-center backdrop-blur-md"
        >
          <div className="w-full max-w-lg">
            {nightResult.eliminatedUsername ? (
              <>
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
                  <Moon className="text-red-400" size={38} />
                </div>

                <p className="mt-8 text-sm font-semibold uppercase tracking-[0.3em] text-red-400">
                  Morning has arrived
                </p>

                <h2 className="mt-5 break-words text-3xl font-bold text-white sm:text-5xl">
                  {nightResult.eliminatedUsername}
                </h2>

                <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-slate-300">
                  didn't make it to breakfast. Their secrets stay buried... for
                  now.
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
                  <Shield className="text-emerald-400" size={38} />
                </div>

                <p className="mt-8 text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">
                  Morning has arrived
                </p>

                <h2 className="mt-5 text-3xl font-bold text-white sm:text-5xl">
                  Nobody was eliminated
                </h2>

                <p className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-slate-300">
                  The Mafia tried. The Doctor denied. Everyone lives to argue
                  another day.
                </p>
              </>
            )}

            <div className="mx-auto mt-10 h-1 w-48 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-400"
                style={{
                  animation: "announcement-progress 4s linear forwards",
                }}
              />
            </div>

            <p className="mt-3 text-xs uppercase tracking-widest text-slate-500">
              Discussion begins shortly
            </p>
          </div>

          <style>{`
            @keyframes announcement-progress {
              from { width: 100%; }
              to { width: 0%; }
            }
          `}</style>
        </div>
      )}
    </main>
  );
}
