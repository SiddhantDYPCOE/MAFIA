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
  Vote,
  RefreshCw,
  Ban,
  Trophy,
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

  const description =
    result?.reason ??
    "The game has ended.";

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
    <section className="mt-8 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-6 text-center sm:p-8">
      <Trophy className="mx-auto text-amber-300" size={48} />
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">
        Game over
      </p>
      <h2 className="mt-3 text-3xl font-black sm:text-4xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-slate-300">{description}</p>

      {winningPlayers.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-semibold text-slate-300">
            {winner === "MAFIA" ? "Mafia team" : "Civilian team"}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {winningPlayers.map((player) => (
              <span
                key={player.id}
                className="rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              >
                {player.username}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl bg-slate-950/70 p-4 text-left">
        <p className="mb-3 text-sm font-semibold text-slate-300">
          Final roles
        </p>
        <div className="space-y-2">
          {(players ?? [])
            .filter((player) => !player.isHost)
            .map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-white/5 p-3"
              >
                <span
                  className={
                    player.isAlive
                      ? "text-white"
                      : "text-slate-500 line-through"
                  }
                >
                  {player.username}
                </span>
                <span className="text-sm text-indigo-300">
                  {player.role ?? "Unknown"}
                  {!player.isAlive ? " · Eliminated" : ""}
                </span>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}

export default function GodNightControl() {
  const { roomCode: paramCode } = useParams();
  const roomCode = (paramCode || "").toUpperCase();
  const navigate = useNavigate();

  const [socket, setSocket] = useState(null);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [votingProgress, setVotingProgress] = useState(null);
  const [votingResult, setVotingResult] = useState(null);
  const [nightResult, setNightResult] = useState(null);

  useEffect(() => {
    let active = true;
    let currentSocket;
    let nightTimer;
    let votingTimer;

    const mergeState = (next) => {
      if (!active || !next) return;

      setState((previous) => ({
        ...(previous ?? {}),
        ...next,
        players: next.players ?? previous?.players ?? [],
        gameResult:
          next.gameResult ??
          previous?.gameResult ??
          null,
      }));
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

      currentSocket.on("game:night:phase-changed", (data) => {
        if (!active || !data) return;
        setState((previous) =>
          previous
            ? {
                ...previous,
                ...data,
                gameResult: data.gameResult ?? previous.gameResult,
              }
            : previous,
        );
      });

      currentSocket.on("game:night:result", (result) => {
        if (!active || !result) return;
        clearTimeout(nightTimer);
        setNightResult(result);
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
        votingTimer = setTimeout(() => {
          if (active) setVotingResult(null);
        }, result.outcome === "TIE" ? 0 : 4000);
      });

      currentSocket.on("game:voting:revote-started", () => {
        if (!active) return;
        setVotingResult(null);
      });

      currentSocket.on("connect", () => {
        if (!active) return;
        setError("");
        currentSocket.emit("game:night:get-state", (response) => {
          if (active && !response?.success) {
            setError(response?.message || "Could not restore game state.");
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
  }, [roomCode]);

  function sendAction(eventName, payload) {
    if (!socket?.connected || busy || state?.phase === "FINISHED") return;

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
          ...previous,
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

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-3 bg-slate-950 p-6 text-white">
        {error ? (
          <div className="text-center">
            <p className="text-red-300">{error}</p>
            <button
              type="button"
              onClick={() => navigate(`/room/${roomCode}`)}
              className="mt-4 text-sm text-slate-400 underline"
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
  const isPreNight = ["LOBBY", "ROLE_ASSIGNMENT"].includes(state.phase);
  const isNight = state.phase === "NIGHT";
  const isDiscussion = state.phase === "DISCUSSION";
  const isVoting = state.phase === "VOTING";
  const prompt = prompts[state.nightStep];
  const nightState = state.nightState ?? {};
  const mafiaSelections = Object.entries(nightState.mafiaSelections ?? {});

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
  const hasSelection =
    state.nightStep === "MAFIA_CHOOSE"
      ? mafiaSelections.length > 0
      : Boolean(currentTargetId);

  const status =
    votingProgress?.status ??
    votingProgress?.votingStatus ??
    "OPEN";
  const submitted = Number(votingProgress?.votesSubmitted ?? 0);
  const eligible = Number(votingProgress?.totalEligible ?? 0);
  const allVotesSubmitted = eligible > 0 && submitted >= eligible;
  const finalCounts =
    votingResult?.counts ??
    (status === "TIE" ? votingProgress?.counts : null) ??
    [];

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm uppercase tracking-[0.25em] text-indigo-400">
          Mafia · God controls
        </p>
        <h1 className="mt-3 text-3xl font-bold">
          {isFinished
            ? "Game complete"
            : isDiscussion || isVoting
              ? `Day ${state.round || 1}`
              : `Night ${state.round || 1}`}
        </h1>
        <p className="mt-2 text-slate-400">Room: {roomCode}</p>

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300"
          >
            {error}
          </p>
        )}

        {isFinished ? (
          <WinnerPanel
            result={state.gameResult}
            players={state.players}
          />
        ) : (
          <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              {isDiscussion || isVoting ? (
                <Sun className="text-amber-400" size={28} />
              ) : (
                <Moon className="text-indigo-400" size={28} />
              )}
              <div>
                <p className="text-sm text-slate-400">Current phase</p>
                <p className="font-semibold">{state.phase}</p>
              </div>
            </div>

            {isPreNight && (
              <>
                <h2 className="mt-8 text-xl font-semibold">Ready to start?</h2>
                <p className="mt-2 text-slate-400">
                  Make sure every playing participant has a role.
                </p>
                <button
                  type="button"
                  disabled={busy || !socket?.connected}
                  onClick={() => sendAction("game:night:start")}
                  className="mt-6 w-full rounded-xl bg-indigo-500 px-5 py-3 font-semibold disabled:opacity-50"
                >
                  {busy ? "Starting..." : "Start Night 1"}
                </button>
              </>
            )}

            {isNight && prompt && (
              <>
                <h2 className="mt-8 text-2xl font-semibold">{prompt.title}</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Round {state.round || 1} · Step {state.nightStep}
                </p>

                {isChooseStep && (
                  <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950 p-4">
                    <h3 className="font-semibold text-slate-300">
                      Player selections
                    </h3>
                    {state.nightStep === "MAFIA_CHOOSE" ? (
                      mafiaSelections.length ? (
                        <div className="mt-3 space-y-2">
                          {mafiaSelections.map(([playerId, targetId]) => (
                            <div
                              key={playerId}
                              className="flex justify-between gap-3 text-sm"
                            >
                              <span className="text-slate-400">
                                {getPlayerName(playerId)}
                              </span>
                              <span className="text-indigo-300">
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
                    ) : (
                      <p className="mt-3 text-sm text-indigo-300">
                        {currentTargetId
                          ? `${getPlayerName(currentTargetId)} selected`
                          : "Waiting for a selection..."}
                      </p>
                    )}
                  </div>
                )}

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
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 font-semibold disabled:opacity-50"
                >
                  {busy && <LoaderCircle className="animate-spin" size={18} />}
                  {busy ? "Please wait..." : prompt.button}
                </button>
              </>
            )}

            {isDiscussion && (
              <>
                <h2 className="mt-8 text-2xl font-semibold">
                  Day {state.round || 1} — Discussion
                </h2>
                <p className="mt-3 text-slate-400">
                  Let the players discuss. Start voting when everyone is ready.
                </p>
                <button
                  type="button"
                  disabled={busy || !socket?.connected}
                  onClick={() => sendAction("game:discussion:start-voting")}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 px-5 py-3 font-semibold disabled:opacity-50"
                >
                  <Users size={18} />
                  {busy ? "Starting..." : "Start Voting"}
                </button>
              </>
            )}

            {isVoting && (
              <div className="mt-8">
                <div className="flex items-center gap-3">
                  <Vote className="text-rose-400" size={28} />
                  <div>
                    <h2 className="text-2xl font-semibold">Voting control</h2>
                    <p className="text-sm text-slate-400">
                      Live tally visible to God only.
                    </p>
                  </div>
                </div>

                {!votingResult && (
                  <>
                    <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950 p-5">
                      <p className="text-sm text-slate-400">Votes submitted</p>
                      <p className="mt-1 text-3xl font-bold tabular-nums">
                        {submitted}
                        <span className="text-lg text-slate-500">
                          {" "}/ {eligible}
                        </span>
                      </p>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full bg-indigo-400 transition-all"
                          style={{
                            width: `${
                              eligible
                                ? Math.min(100, (submitted / eligible) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <p className="mt-3 text-xs text-slate-500">
                        Players cannot see the live tally.
                      </p>
                    </div>

                    <h3 className="mt-6 font-semibold">Live vote tally</h3>
                    <div className="mt-3 space-y-3">
                      {(votingProgress?.counts ?? []).map((candidate) => (
                        <div
                          key={candidate.playerId}
                          className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                        >
                          <div className="flex justify-between gap-4">
                            <span>{candidate.username}</span>
                            <span className="font-semibold text-indigo-300">
                              {candidate.count}
                            </span>
                          </div>
                          <div className="mt-3 h-1.5 rounded-full bg-slate-800">
                            <div
                              className="h-1.5 rounded-full bg-indigo-400"
                              style={{
                                width: `${
                                  submitted
                                    ? Math.min(
                                        100,
                                        (candidate.count / submitted) * 100,
                                      )
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
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
                      className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 px-5 py-3 font-semibold disabled:opacity-40"
                    >
                      <Vote size={18} />
                      {allVotesSubmitted
                        ? "End Voting & Reveal Results"
                        : `Waiting for votes (${submitted}/${eligible})`}
                    </button>
                  </>
                )}

                {votingResult?.outcome === "TIE" && (
                  <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
                    <h3 className="text-lg font-semibold text-amber-300">
                      Tie — God must decide
                    </h3>
                    <div className="mt-4 space-y-2">
                      {finalCounts.map((candidate) => (
                        <div
                          key={candidate.playerId}
                          className="flex justify-between rounded-lg bg-slate-950 p-3"
                        >
                          <span>{candidate.username}</span>
                          <span className="text-amber-300">
                            {candidate.count} vote
                            {candidate.count === 1 ? "" : "s"}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={busy || !socket?.connected}
                      onClick={() => sendAction("game:voting:revote")}
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 font-semibold disabled:opacity-50"
                    >
                      <RefreshCw size={18} />
                      Revote Between Tied Players
                    </button>
                    <button
                      type="button"
                      disabled={busy || !socket?.connected}
                      onClick={() =>
                        sendAction("game:voting:no-elimination")
                      }
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-semibold disabled:opacity-50"
                    >
                      <Ban size={18} />
                      No Elimination — Start Next Night
                    </button>
                  </div>
                )}

                {votingResult && votingResult.outcome !== "TIE" && (
                  <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950 p-5">
                    <h3 className="text-lg font-semibold">
                      {votingResult.outcome === "GAME_OVER"
                        ? "Game finished"
                        : votingResult.outcome === "ELIMINATED"
                          ? `${votingResult.eliminatedUsername} was eliminated`
                          : "No elimination"}
                    </h3>
                    <div className="mt-4 space-y-2">
                      {finalCounts.map((candidate) => (
                        <div
                          key={candidate.playerId}
                          className="flex justify-between rounded-lg bg-slate-900 p-3"
                        >
                          <span>{candidate.username}</span>
                          <span className="text-indigo-300">
                            {candidate.count} vote
                            {candidate.count === 1 ? "" : "s"}
                          </span>
                        </div>
                      ))}
                    </div>
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

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Users size={20} className="text-indigo-400" />
            Players
          </h2>
          <div className="mt-4 space-y-2">
            {(state.players ?? []).map((player) => (
              <div
                key={player.id}
                className="flex justify-between gap-3 rounded-lg bg-slate-950 p-3"
              >
                <span
                  className={
                    player.isAlive ? "" : "text-slate-500 line-through"
                  }
                >
                  {player.username}
                  {player.isHost ? " (God)" : ""}
                </span>
                <span className="text-xs text-slate-400">
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
          </div>
        </section>
      </div>

      {nightResult && !isFinished && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 px-6 text-center">
          <div className="max-w-xl">
            {nightResult.announcement === "NO_DEATH" ? (
              <CheckCircle2 className="mx-auto text-emerald-300" size={48} />
            ) : (
              <Skull className="mx-auto text-rose-400" size={48} />
            )}
            <p className="mt-6 text-sm uppercase tracking-[0.3em] text-indigo-400">
              The sun rises
            </p>
            <h2 className="mt-5 text-4xl font-black">
              {nightResult.announcement === "NO_DEATH"
                ? "Nobody died!"
                : "A dark morning..."}
            </h2>
            <p className="mt-5 text-slate-300">
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