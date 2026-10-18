
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  LoaderCircle,
  Moon,
  Users,
  Sun,
  Skull,
  CheckCircle2,
  Vote,
  RefreshCw,
  Ban,
  Trophy,
  Clock,
  Activity,
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
  POLICE_WAKE: { title: "Police wake up", button: "Next" },
  POLICE_CHOOSE: {
    title: "Police investigates a player",
    button: "Next",
  },
  NIGHT_END: {
    title: "Everyone wake up",
    button: "Reveal morning result",
  },
};

function WinnerPanel({ result, players }) {
  const winner = result?.winner;

  const title =
    winner === "MAFIA"
      ? "Mafia Wins"
      : winner === "CIVILIANS"
        ? "Civilians Win"
        : winner === "DRAW"
          ? "It's a Draw"
          : "Game Finished";

  const description = result?.reason ?? "The game has ended.";

  const winningPlayers = (players ?? []).filter(
    (player) =>
      !player.isHost &&
      (winner === "MAFIA"
        ? player.role === "MAFIA"
        : winner === "CIVILIANS"
          ? player.role !== "MAFIA"
          : false),
  );

  return (
    <section className="mt-8 border border-amber-400/30 bg-neutral-900 p-6 text-center sm:p-8">
      <Trophy className="mx-auto text-amber-300" size={40} />

      <p className="mt-4 text-sm text-neutral-500">Game over</p>

      <h2 className="mt-1 text-3xl font-bold sm:text-4xl">
        {title}
      </h2>

      <p className="mx-auto mt-3 max-w-xl text-neutral-400">
        {description}
      </p>

      {winningPlayers.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-semibold text-neutral-300">
            {winner === "MAFIA" ? "Mafia team" : "Civilian team"}
          </p>

          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {winningPlayers.map((player) => (
              <span
                key={player.id}
                className="border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm"
              >
                {player.username}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 border border-neutral-800 bg-neutral-950 text-left">
        <p className="border-b border-neutral-800 px-4 py-3 text-sm font-semibold text-neutral-300">
          Final roles
        </p>

        {(players ?? [])
          .filter((player) => !player.isHost)
          .map((player) => (
            <div
              key={player.id}
              className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-2.5 last:border-b-0"
            >
              <span
                className={
                  player.isAlive
                    ? "text-white"
                    : "text-neutral-500 line-through"
                }
              >
                {player.username}
              </span>

              <span className="text-sm text-neutral-400">
                {player.role ?? "Unknown"}
                {!player.isAlive ? " · Eliminated" : ""}
              </span>
            </div>
          ))}
      </div>
    </section>
  );
}

function TieDecisionPanel({
  counts,
  busy,
  connected,
  onRevote,
  onNoElimination,
}) {
  return (
    <div className="mt-6 border border-amber-400/30 bg-neutral-950 p-5">
      <div className="flex items-start gap-3">
        <Clock className="mt-1 shrink-0 text-amber-300" size={24} />

        <div>
          <h3 className="text-lg font-semibold text-amber-300">
            Voting tied — your decision is required
          </h3>

          <p className="mt-2 text-sm leading-6 text-neutral-400">
            The tied players will not be eliminated automatically.
            Choose whether to hold a revote between the tied players
            or skip elimination and proceed to the next night.
          </p>
        </div>
      </div>

      {counts.length > 0 && (
        <div className="mt-5 border border-neutral-800">
          <p className="border-b border-neutral-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Tied vote results
          </p>

          {counts.map((candidate) => (
            <div
              key={candidate.playerId}
              className="flex items-center justify-between gap-4 border-b border-neutral-800 bg-neutral-900 px-3 py-3 last:border-b-0"
            >
              <span className="text-neutral-200">
                {candidate.username}
              </span>

              <span className="font-semibold text-amber-300">
                {candidate.count}{" "}
                {candidate.count === 1 ? "vote" : "votes"}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy || !connected}
          onClick={onRevote}
          className="flex items-center justify-center gap-2 border border-neutral-100 bg-neutral-100 px-4 py-3 font-semibold text-neutral-950 transition hover:bg-neutral-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshCw size={18} />
          {busy ? "Processing..." : "Revote Between Tied Players"}
        </button>

        <button
          type="button"
          disabled={busy || !connected}
          onClick={onNoElimination}
          className="flex items-center justify-center gap-2 border border-neutral-600 px-4 py-3 font-semibold text-neutral-200 transition hover:border-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Ban size={18} />
          No Elimination
        </button>
      </div>

      <p className="mt-4 text-xs text-neutral-500">
        No action is taken until God selects one of these options.
      </p>
    </div>
  );
}

export default function GodNightControl() {
  const { roomCode: paramCode } = useParams();
  const roomCode = (paramCode || "").toUpperCase();
  const navigate = useNavigate();

  const activityLogKey = `mafia_activity_log_enabled_${roomCode}`;

  const [socket, setSocket] = useState(null);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [votingProgress, setVotingProgress] = useState(null);
  const [votingResult, setVotingResult] = useState(null);
  const [nightResult, setNightResult] = useState(null);

  const [activityLogEnabled, setActivityLogEnabled] = useState(
    () => localStorage.getItem(activityLogKey) === "true",
  );
  const [activityLogs, setActivityLogs] = useState([]);

  const stateRef = useRef(null);
  const activityLogEnabledRef = useRef(activityLogEnabled);

  const activitySnapshotRef = useRef({
    initialized: false,
    phase: null,
    nightStep: null,
    mafiaSelections: {},
    doctorSelection: null,
    policeSelection: null,
  });

  // Keep the ref synchronized so socket handlers always read the latest setting.
  useEffect(() => {
    activityLogEnabledRef.current = activityLogEnabled;
  }, [activityLogEnabled]);

  // Synchronize the setting changed on the role-assignment page.
  useEffect(() => {
    const syncActivityLogSetting = (event) => {
      const changedRoomCode = event?.detail?.roomCode;

      if (
        changedRoomCode &&
        changedRoomCode !== roomCode
      ) {
        return;
      }

      const enabled =
        localStorage.getItem(activityLogKey) === "true";

      activityLogEnabledRef.current = enabled;
      setActivityLogEnabled(enabled);

      if (!enabled) {
        setActivityLogs([]);
      }
    };

    window.addEventListener("focus", syncActivityLogSetting);
    window.addEventListener("storage", syncActivityLogSetting);
    window.addEventListener(
      "mafia-activity-log-setting-changed",
      syncActivityLogSetting,
    );

    return () => {
      window.removeEventListener("focus", syncActivityLogSetting);
      window.removeEventListener("storage", syncActivityLogSetting);
      window.removeEventListener(
        "mafia-activity-log-setting-changed",
        syncActivityLogSetting,
      );
    };
  }, [activityLogKey, roomCode]);

  // Clear existing entries whenever activity logging is disabled.
  useEffect(() => {
    if (!activityLogEnabled) {
      setActivityLogs([]);
    }
  }, [activityLogEnabled]);

  const addActivityLog = useCallback((message) => {
    if (!activityLogEnabledRef.current) return;

    setActivityLogs((previous) =>
      [
        ...previous,
        {
          id: `${Date.now()}-${previous.length}`,
          message,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        },
      ].slice(-100),
    );
  }, []);

  // Initialize the socket and listen for game-state updates.
  useEffect(() => {
    let active = true;
    let currentSocket;
    let nightTimer;
    let votingTimer;

    const resetActivitySnapshot = () => {
      activitySnapshotRef.current = {
        initialized: false,
        phase: null,
        nightStep: null,
        mafiaSelections: {},
        doctorSelection: null,
        policeSelection: null,
      };
    };

    const mergeState = (next) => {
      if (!active || !next) return;

      const previous = stateRef.current;

      const merged = {
        ...(previous ?? {}),
        ...next,
        players: next.players ?? previous?.players ?? [],
        gameResult: Object.prototype.hasOwnProperty.call(
          next,
          "gameResult",
        )
          ? next.gameResult
          : previous?.gameResult ?? null,
      };

      // A fresh lobby must not inherit the previous game's state.
      if (merged.phase === "LOBBY" && previous?.phase !== "LOBBY") {
        merged.gameResult = null;
        merged.nightStep = null;
        merged.nightState = null;
        merged.round = 0;

        setVotingProgress(null);
        setVotingResult(null);
        setNightResult(null);

        clearTimeout(nightTimer);
        clearTimeout(votingTimer);

        resetActivitySnapshot();
      }

      stateRef.current = merged;

      const nightState = merged.nightState ?? {};
      const snapshot = activitySnapshotRef.current;

      const mafiaSelections = nightState.mafiaSelections ?? {};
      const doctorSelection = nightState.doctorSelection ?? null;
      const policeSelection = nightState.policeSelection ?? null;

      const getName = (playerId) =>
        merged.players.find((player) => player.id === playerId)
          ?.username ?? "Unknown player";

      // Don't log old selections when first restoring the page.
      if (!snapshot.initialized) {
        activitySnapshotRef.current = {
          initialized: true,
          phase: merged.phase ?? null,
          nightStep: merged.nightStep ?? null,
          mafiaSelections: { ...mafiaSelections },
          doctorSelection,
          policeSelection,
        };

        setState(merged);
        return;
      }

      if (
        merged.phase === "NIGHT" &&
        snapshot.phase !== "NIGHT"
      ) {
        addActivityLog("🌙 Everyone has gone to sleep.");
      }

      if (
        merged.nightStep === "NIGHT_END" &&
        snapshot.nightStep !== "NIGHT_END"
      ) {
        addActivityLog("☀️ Morning has arrived.");
      }

      for (const [mafiaPlayerId, targetId] of Object.entries(
        mafiaSelections,
      )) {
        if (snapshot.mafiaSelections[mafiaPlayerId] !== targetId) {
          addActivityLog(
            `🔪 ${getName(mafiaPlayerId)} selected ${getName(targetId)} as the target.`,
          );
        }
      }

      if (
        doctorSelection &&
        doctorSelection !== snapshot.doctorSelection
      ) {
        addActivityLog(
          `🩺 The Doctor has chosen ${getName(doctorSelection)} to protect.`,
        );
      }

      if (
        policeSelection &&
        policeSelection !== snapshot.policeSelection
      ) {
        addActivityLog(
          `🔍 The Police has investigated ${getName(policeSelection)}.`,
        );
      }

      activitySnapshotRef.current = {
        initialized: true,
        phase: merged.phase ?? snapshot.phase,
        nightStep: merged.nightStep ?? snapshot.nightStep,
        mafiaSelections: { ...mafiaSelections },
        doctorSelection,
        policeSelection,
      };

      setState(merged);
    };

    const handleGameRestart = (payload) => {
      if (!active) return;

      const targetRoomCode = (
        payload?.roomCode || roomCode
      ).toUpperCase();

      clearTimeout(nightTimer);
      clearTimeout(votingTimer);

      setBusy(false);
      setError("");
      setVotingProgress(null);
      setVotingResult(null);
      setNightResult(null);
      setActivityLogs([]);

      stateRef.current = null;
      resetActivitySnapshot();

      navigate(`/room/${targetRoomCode}`);
    };

    try {
      const raw = localStorage.getItem(`mafia_session_${roomCode}`);

      if (!raw) {
        setError("No saved session. Rejoin the room first.");
        return;
      }

      currentSocket = connectPlayerSocket(JSON.parse(raw));

      currentSocket.on("game:night:god-state", mergeState);
      currentSocket.on("game:night:public-state", mergeState);
      currentSocket.on("game:night:phase-changed", mergeState);
      currentSocket.on("game:play-again", handleGameRestart);

      currentSocket.on("game:night:result", (result) => {
        if (!active || !result) return;

        clearTimeout(nightTimer);
        setNightResult(result);

        if (result.announcement === "NO_DEATH") {
          addActivityLog(
            "☀️ Morning arrived. Nobody was eliminated during the night.",
          );
        } else {
          addActivityLog(
            `☀️ Morning arrived. ${result.eliminatedUsername || "Someone"} was eliminated.`,
          );
        }

        nightTimer = setTimeout(() => {
          if (active) setNightResult(null);
        }, 4000);
      });

      currentSocket.on("game:voting:god-state", (data) => {
        if (active && data) setVotingProgress(data);
      });

      currentSocket.on("game:voting:result", (result) => {
        if (!active || !result) return;

        clearTimeout(votingTimer);
        setVotingResult(result);

        // Keep the tie decision visible until God chooses an option.
        if (result.outcome !== "TIE") {
          votingTimer = setTimeout(() => {
            if (active) setVotingResult(null);
          }, 4000);
        }
      });

      currentSocket.on("game:voting:revote-started", () => {
        if (!active) return;

        clearTimeout(votingTimer);
        setVotingResult(null);
      });

      currentSocket.on("connect", () => {
        if (!active) return;

        setError("");

        currentSocket.emit("game:night:get-state", (response) => {
          if (active && !response?.success) {
            setError(
              response?.message || "Could not restore game state.",
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
    } catch (err) {
      console.error("GodNightControl initialization failed:", err);
      setError("Could not restore the room session.");
    }

    return () => {
      active = false;
      clearTimeout(nightTimer);
      clearTimeout(votingTimer);
      currentSocket?.removeAllListeners();
      currentSocket?.disconnect();
    };
  }, [roomCode, navigate, addActivityLog]);

  function sendAction(eventName, payload) {
    if (
      !socket?.connected ||
      busy ||
      state?.phase === "FINISHED" ||
      state?.gameResult
    ) {
      return;
    }

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
        return;
      }

      if (response.phase === "FINISHED" && response.gameResult) {
        setState((previous) => ({
          ...(previous ?? {}),
          phase: "FINISHED",
          gameResult: response.gameResult,
        }));
      }
    };

    if (payload === undefined) {
      socket.timeout(8000).emit(eventName, callback);
    } else {
      socket.timeout(8000).emit(eventName, payload, callback);
    }
  }

  function handlePlayAgain() {
    if (!socket?.connected || busy) {
      setError("Not connected to the server. Please wait and try again.");
      return;
    }

    setBusy(true);
    setError("");

    socket.timeout(10000).emit(
      "game:play-again",
      (timeoutError, response) => {
        if (timeoutError) {
          setBusy(false);
          setError("The server did not respond. Please try again.");
          return;
        }

        if (!response?.success) {
          setBusy(false);
          setError(response?.message || "Unable to restart the game.");
          return;
        }

        // Fallback navigation if the broadcast hasn't navigated the host.
        navigate(`/room/${roomCode}`);
      },
    );
  }

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-3 bg-neutral-950 p-6 text-neutral-100">
        {error ? (
          <div className="text-center">
            <p className="text-red-300">{error}</p>

            <button
              type="button"
              onClick={() => navigate(`/room/${roomCode}`)}
              className="mt-4 text-sm text-neutral-400 underline hover:text-white"
            >
              Return to room
            </button>
          </div>
        ) : (
          <>
            <LoaderCircle className="animate-spin" />
            Loading game state...
          </>
        )}
      </main>
    );
  }

  const isFinished =
    state.phase === "FINISHED" || Boolean(state.gameResult);

  const isPreNight = ["LOBBY", "ROLE_ASSIGNMENT"].includes(
    state.phase,
  );
  const isNight = state.phase === "NIGHT";
  const isDiscussion = state.phase === "DISCUSSION";
  const isVoting = state.phase === "VOTING";

  const prompt = prompts[state.nightStep];
  const nightState = state.nightState ?? {};

  const mafiaSelections = Object.entries(
    nightState.mafiaSelections ?? {},
  );

  const getPlayerName = (id) =>
    state.players?.find((player) => player.id === id)?.username ??
    "Unknown player";

  const currentTargetId =
    state.nightStep === "MAFIA_CHOOSE"
      ? mafiaSelections.at(-1)?.[1] ?? null
      : state.nightStep === "DOCTOR_CHOOSE"
        ? nightState.doctorSelection
        : state.nightStep === "POLICE_CHOOSE"
          ? nightState.policeSelection
          : null;

  const isChooseStep = Boolean(state.nightStep?.endsWith("_CHOOSE"));

  const mafiaProposal = nightState.mafiaProposal ?? null;

  const hasSelection =
    state.nightStep === "MAFIA_CHOOSE"
      ? mafiaProposal?.accepted === true &&
      Boolean(nightState.mafiaTarget)
      : Boolean(currentTargetId);

  const status =
    votingProgress?.status ??
    votingProgress?.votingStatus ??
    "OPEN";

  const submitted = Number(votingProgress?.votesSubmitted ?? 0);
  const eligible = Number(votingProgress?.totalEligible ?? 0);

  const allVotesSubmitted =
    eligible > 0 && submitted >= eligible;

  const finalCounts =
    votingResult?.counts ??
    (status === "TIE" ? votingProgress?.counts : null) ??
    [];

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-10 text-neutral-100">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold tracking-widest text-neutral-500">
          MAFIA · God controls
        </p>

        <h1 className="mt-3 text-3xl font-bold">
          {isFinished
            ? "Game complete"
            : isDiscussion || isVoting
              ? `Day ${state.round || 1}`
              : `Night ${state.round || 1}`}
        </h1>

        <p className="mt-2 text-neutral-500">
          Room: {roomCode}
        </p>

        {error && (
          <p
            role="alert"
            className="mt-5 border border-red-500/30 bg-red-500/5 p-4 text-red-300"
          >
            {error}
          </p>
        )}

        {isFinished && (
          <button
            type="button"
            disabled={busy || !socket?.connected}
            onClick={handlePlayAgain}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle className="animate-spin" size={18} />
            ) : (
              <RefreshCw size={18} />
            )}
            {busy ? "Restarting game..." : "Play Again"}
          </button>
        )}

        {isFinished ? (
          <WinnerPanel
            result={state.gameResult}
            players={state.players}
          />
        ) : (
          <section className="mt-8 border border-neutral-800 bg-neutral-900 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              {isDiscussion || isVoting ? (
                <Sun className="text-amber-400" size={26} />
              ) : (
                <Moon className="text-neutral-300" size={26} />
              )}

              <div>
                <p className="text-sm text-neutral-500">
                  Current phase
                </p>
                <p className="font-semibold">{state.phase}</p>
              </div>
            </div>

            {activityLogEnabled && (
              <div className="mt-6 border border-neutral-800 bg-neutral-950">
                <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Activity
                      size={18}
                      className="text-emerald-400"
                    />
                    <h3 className="font-semibold">
                      God activity log
                    </h3>
                  </div>

                  <span className="text-xs text-neutral-500">
                    {activityLogs.length} events
                  </span>
                </div>

                <div className="max-h-64 space-y-3 overflow-y-auto p-4">
                  {activityLogs.length === 0 ? (
                    <p className="text-sm text-neutral-500">
                      Waiting for game activity...
                    </p>
                  ) : (
                    activityLogs.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex gap-3 text-sm"
                      >
                        <span className="shrink-0 pt-0.5 text-xs text-neutral-600">
                          {entry.time}
                        </span>

                        <p className="text-neutral-300">
                          {entry.message}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {isPreNight && (
              <>
                <h2 className="mt-8 text-xl font-semibold">
                  Ready to start?
                </h2>

                <p className="mt-2 text-neutral-500">
                  Make sure every playing participant has a role.
                </p>

                <button
                  type="button"
                  disabled={busy || !socket?.connected}
                  onClick={() => sendAction("game:night:start")}
                  className="mt-6 w-full border border-neutral-100 bg-neutral-100 px-5 py-3 font-semibold text-neutral-950 transition hover:bg-neutral-300 disabled:opacity-50"
                >
                  {busy ? "Starting..." : "Start Night 1"}
                </button>
              </>
            )}

            {isNight && prompt && (
              <>
                <h2 className="mt-8 text-2xl font-semibold">
                  {prompt.title}
                </h2>
                {state.nightStep === "MAFIA_CHOOSE" && (
                  <div className="mt-5 border border-red-500/30 bg-neutral-950 p-4">
                    <h3 className="font-semibold text-red-300">
                      Mafia target agreement
                    </h3>

                    {!mafiaProposal ? (
                      <p className="mt-3 text-sm text-neutral-400">
                        Waiting for a Mafia member to propose a target...
                      </p>
                    ) : (
                      <>
                        <p className="mt-3 text-sm">
                          {mafiaProposal.accepted ? (
                            <span className="text-emerald-300">
                              All living Mafia members confirmed. You can advance.
                            </span>
                          ) : (
                            <span className="text-amber-300">
                              Waiting for Mafia members to confirm or cancel.
                            </span>
                          )}
                        </p>

                        <div className="mt-4 space-y-2">
                          {(state.livingMafia ?? []).map((player) => {
                            const confirmed =
                              (mafiaProposal.confirmations ?? []).includes(
                                player.id,
                              );

                            return (
                              <div
                                key={player.id}
                                className="flex items-center justify-between gap-3 border border-neutral-800 px-3 py-2"
                              >
                                <span className="text-sm text-neutral-300">
                                  {player.username}
                                  {player.id === mafiaProposal.proposerId
                                    ? " (Proposer)"
                                    : ""}
                                </span>

                                <span
                                  className={`text-xs ${confirmed
                                      ? "text-emerald-300"
                                      : "text-amber-300"
                                    }`}
                                >
                                  {confirmed ? "Confirmed" : "Pending"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
                <p className="mt-2 text-sm text-neutral-500">
                  Round {state.round || 1} · Step {state.nightStep}
                </p>

                {/* {isChooseStep && (
      <div className="mt-5 border border-neutral-800 bg-neutral-950 p-4">
        <h3 className="font-semibold text-neutral-300">
          Player selections
        </h3>

        {state.nightStep === "MAFIA_CHOOSE" ? (
          mafiaSelections.length > 0 ? (
            <div className="mt-3 space-y-2">
              {mafiaSelections.map(
                ([playerId, targetId]) => (
                  <div
                    key={playerId}
                    className="flex justify-between gap-3 text-sm"
                  >
                    <span className="text-neutral-500">
                      {getPlayerName(playerId)}
                    </span>

                    <span className="text-neutral-200">
                      → {getPlayerName(targetId)}
                    </span>
                  </div>
                ),
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-amber-300">
              Waiting for Mafia to select a target...
            </p>
          )
        ) : (
          <p className="mt-3 text-sm text-neutral-200">
            {currentTargetId
              ? `${getPlayerName(currentTargetId)} selected`
              : "Waiting for a selection..."}
          </p>
        )}
      </div>
    )} */}

                <button
                  type="button"
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
                  className="mt-6 flex w-full items-center justify-center gap-2 border border-neutral-100 bg-neutral-100 px-5 py-3 font-semibold text-neutral-950 transition hover:bg-neutral-300 disabled:opacity-50"
                >
                  {busy && (
                    <LoaderCircle
                      className="animate-spin"
                      size={18}
                    />
                  )}

                  {busy ? "Please wait..." : prompt.button}
                </button>
              </>
            )}

            {isDiscussion && (
              <>
                <h2 className="mt-8 text-2xl font-semibold">
                  Day {state.round || 1} — Discussion
                </h2>

                <p className="mt-3 text-neutral-500">
                  Let the players discuss. Start voting when everyone
                  is ready.
                </p>

                <button
                  type="button"
                  disabled={busy || !socket?.connected}
                  onClick={() =>
                    sendAction("game:discussion:start-voting")
                  }
                  className="mt-6 flex w-full items-center justify-center gap-2 border border-red-500/50 px-5 py-3 font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                >
                  <Users size={18} />
                  {busy ? "Starting..." : "Start Voting"}
                </button>
              </>
            )}

            {isVoting && (
              <div className="mt-8">
                <div className="flex items-center gap-3">
                  <Vote className="text-neutral-300" size={26} />

                  <div>
                    <h2 className="text-2xl font-semibold">
                      Voting control
                    </h2>

                    <p className="text-sm text-neutral-500">
                      Live tally visible to God only.
                    </p>
                  </div>
                </div>

                {!votingResult && (
                  <>
                    <div className="mt-6 border border-neutral-800 bg-neutral-950 p-5">
                      <p className="text-sm text-neutral-500">
                        Votes submitted
                      </p>

                      <p className="mt-1 text-3xl font-bold tabular-nums">
                        {submitted}
                        <span className="text-lg text-neutral-500">
                          {" "}/ {eligible}
                        </span>
                      </p>

                      <div className="mt-4 h-1.5 overflow-hidden bg-neutral-800">
                        <div
                          className="h-full bg-neutral-100 transition-all"
                          style={{
                            width: `${eligible
                              ? Math.min(
                                100,
                                (submitted / eligible) * 100,
                              )
                              : 0
                              }%`,
                          }}
                        />
                      </div>

                      <p className="mt-3 text-xs text-neutral-500">
                        Players cannot see the live tally.
                      </p>
                    </div>

                    <h3 className="mt-6 font-semibold">
                      Live vote tally
                    </h3>

                    <div className="mt-3 space-y-2">
                      {(votingProgress?.counts ?? []).map(
                        (candidate) => (
                          <div
                            key={candidate.playerId}
                            className="border border-neutral-800 bg-neutral-950 p-4"
                          >
                            <div className="flex justify-between gap-4">
                              <span>{candidate.username}</span>

                              <span className="font-semibold text-neutral-300">
                                {candidate.count}
                              </span>
                            </div>

                            <div className="mt-3 h-1.5 bg-neutral-800">
                              <div
                                className="h-1.5 bg-neutral-100"
                                style={{
                                  width: `${submitted
                                    ? Math.min(
                                      100,
                                      (candidate.count /
                                        submitted) *
                                      100,
                                    )
                                    : 0
                                    }%`,
                                }}
                              />
                            </div>
                          </div>
                        ),
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={
                        busy ||
                        !socket?.connected ||
                        !allVotesSubmitted ||
                        status !== "OPEN"
                      }
                      onClick={() => sendAction("game:voting:end")}
                      className="mt-6 flex w-full items-center justify-center gap-2 border border-neutral-100 bg-neutral-100 px-5 py-3 font-semibold text-neutral-950 transition hover:bg-neutral-300 disabled:opacity-40"
                    >
                      <Vote size={18} />

                      {allVotesSubmitted
                        ? "End Voting & Reveal Results"
                        : `Waiting for votes (${submitted}/${eligible})`}
                    </button>
                  </>
                )}

                {votingResult?.outcome === "TIE" && (
                  <TieDecisionPanel
                    counts={finalCounts}
                    busy={busy}
                    connected={Boolean(socket?.connected)}
                    onRevote={() =>
                      sendAction("game:voting:revote")
                    }
                    onNoElimination={() =>
                      sendAction("game:voting:no-elimination")
                    }
                  />
                )}

                {votingResult &&
                  votingResult.outcome !== "TIE" && (
                    <div className="mt-6 border border-neutral-700 bg-neutral-950 p-5">
                      <h3 className="text-lg font-semibold">
                        {votingResult.outcome === "GAME_OVER"
                          ? "Game finished"
                          : votingResult.outcome === "ELIMINATED"
                            ? `${votingResult.eliminatedUsername} was eliminated`
                            : "No elimination"}
                      </h3>

                      {finalCounts.length > 0 && (
                        <div className="mt-4 border border-neutral-800">
                          {finalCounts.map((candidate) => (
                            <div
                              key={candidate.playerId}
                              className="flex justify-between border-b border-neutral-800 bg-neutral-900 px-3 py-2.5 last:border-b-0"
                            >
                              <span>{candidate.username}</span>

                              <span className="text-neutral-300">
                                {candidate.count}{" "}
                                {candidate.count === 1
                                  ? "vote"
                                  : "votes"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {votingResult.gameResult && (
                        <p className="mt-4 text-amber-300">
                          {votingResult.gameResult.reason}
                        </p>
                      )}
                    </div>
                  )}
              </div>
            )}
          </section>
        )}

        <section className="mt-6 border border-neutral-800 bg-neutral-900">
          <h2 className="flex items-center gap-2 border-b border-neutral-800 px-5 py-4 font-semibold">
            <Users size={18} className="text-neutral-400" />
            Players
          </h2>

          {(state.players ?? []).map((player) => (
            <div
              key={player.id}
              className="flex justify-between gap-3 border-b border-neutral-800 px-5 py-3 last:border-b-0"
            >
              <span
                className={
                  player.isAlive
                    ? ""
                    : "text-neutral-500 line-through"
                }
              >
                {player.username}
                {player.isHost ? " (God)" : ""}
              </span>

              <span className="text-xs text-neutral-500">
                {isFinished && !player.isHost && player.role
                  ? player.role
                  : !player.isAlive
                    ? "Eliminated"
                    : player.isConnected
                      ? "Connected"
                      : "Disconnected"}
              </span>
            </div>
          ))}
        </section>
      </div>

      {nightResult && !isFinished && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/95 px-6 text-center">
          <div className="max-w-xl">
            {nightResult.announcement === "NO_DEATH" ? (
              <CheckCircle2
                className="mx-auto text-emerald-300"
                size={44}
              />
            ) : (
              <Skull
                className="mx-auto text-red-400"
                size={44}
              />
            )}

            <p className="mt-6 text-sm text-neutral-500">
              The sun rises
            </p>

            <h2 className="mt-3 text-4xl font-bold">
              {nightResult.announcement === "NO_DEATH"
                ? "Nobody died!"
                : "A dark morning..."}
            </h2>

            <p className="mt-5 text-neutral-400">
              {nightResult.announcement === "NO_DEATH"
                ? "The Doctor saved the target. Everyone lives to argue another day."
                : `${nightResult.eliminatedUsername || "Someone"} didn't make it to breakfast.`}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
