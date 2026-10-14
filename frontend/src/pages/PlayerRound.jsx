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
  Trophy,
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
    description: "Select a living player to protect tonight.",
    button: "Confirm save",
  },
  POLICE: {
    title: "Investigate a player",
    description: "Investigate a living player. Your result is private.",
    button: "Investigate player",
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
    <section className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-6 text-center">
      <Trophy className="mx-auto text-amber-300" size={48} />
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">
        Game over
      </p>
      <h2 className="mt-3 text-3xl font-black sm:text-4xl">{title}</h2>
      <p className="mt-3 text-slate-300">
        {result?.reason ?? "The game has ended."}
      </p>

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

      <div className="mt-6 space-y-2 text-left">
        {(players ?? [])
          .filter((player) => !player.isHost)
          .map((player) => (
            <div
              key={player.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-slate-950 p-3"
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
    </section>
  );
}

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
  const [lastInvestigation, setLastInvestigation] = useState(null);

  const [votingPrivate, setVotingPrivate] = useState(null);
  const [voteTarget, setVoteTarget] = useState("");
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [votingResult, setVotingResult] = useState(null);
  const [nightResult, setNightResult] = useState(null);

  useEffect(() => {
    let active = true;
    let currentSocket;
    let nightTimer;
    let votingTimer;

    const mergePublicState = (nextState) => {
      if (!active || !nextState) return;

      setState((previous) => ({
        ...(previous ?? {}),
        ...nextState,
        players: nextState.players ?? previous?.players ?? [],
        gameResult:
          nextState.gameResult ??
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

      currentSocket.on(
        "game:night:public-state",
        mergePublicState,
      );

      currentSocket.on(
        "game:night:phase-changed",
        (data) => {
          if (!active || !data) return;

          setState((previous) =>
            previous
              ? {
                  ...previous,
                  ...data,
                  gameResult:
                    data.gameResult ?? previous.gameResult ?? null,
                }
              : previous,
          );
        },
      );

      currentSocket.on("game:night:private-state", (data) => {
        if (!active || !data) return;

        setPrivateState(data);

        if (data.selection) {
          setSelectedTarget(data.selection);
        }

        if (data.policeResult) {
          setLastInvestigation(data.policeResult);
        }
      });

      currentSocket.on("game:night:result", (result) => {
        if (!active || !result) return;

        clearTimeout(nightTimer);
        setNightResult(result);

        nightTimer = setTimeout(() => {
          if (active) setNightResult(null);
        }, 4000);
      });

      currentSocket.on("game:voting:private-state", (data) => {
        if (!active || !data) return;

        setVotingPrivate(data);

        if (data.votingStatus === "OPEN") {
          setVotingResult(null);
          setVoteTarget("");
          setMessage("");
        }
      });

      currentSocket.on("game:voting:result", (result) => {
        if (!active || !result) return;

        clearTimeout(votingTimer);
        setVotingResult(result);

        // Keep the tie result available while God chooses a resolution.
        if (result.outcome !== "TIE") {
          votingTimer = setTimeout(() => {
            if (active) setVotingResult(null);
          }, 4000);
        }
      });

      currentSocket.on("game:voting:revote-started", () => {
        if (!active) return;
        setVotingResult(null);
        setVoteTarget("");
        setVoteSubmitting(false);
      });

      currentSocket.on("connect", () => {
        if (!active) return;

        setError("");

        currentSocket.emit("game:night:get-state", (response) => {
          if (active && !response?.success) {
            setError(
              response?.message || "Unable to restore game state.",
            );
          }
        });

        currentSocket.emit("game:my-role", (response) => {
          if (!active) return;

          if (response?.success) {
            setMyRole(response.role);
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
      console.error("PlayerRound initialization failed:", err);
      setError("Could not restore your room session.");
    }

    return () => {
      active = false;
      clearTimeout(nightTimer);
      clearTimeout(votingTimer);
      currentSocket?.removeAllListeners();
      currentSocket?.disconnect();
    };
  }, [roomCode]);

  const votingStatus =
    votingPrivate?.votingStatus ?? votingPrivate?.status;

  const isFinished =
    state?.phase === "FINISHED" || Boolean(state?.gameResult);

  function submitVote() {
    if (
      isFinished ||
      !socket?.connected ||
      voteSubmitting ||
      !voteTarget ||
      votingPrivate?.hasVoted ||
      votingStatus !== "OPEN"
    ) {
      return;
    }

    setVoteSubmitting(true);
    setError("");
    setMessage("");

    socket.timeout(8000).emit(
      "game:voting:cast",
      { targetId: voteTarget },
      (timeoutError, response) => {
        if (timeoutError) {
          setVoteSubmitting(false);
          setError("The server did not respond. Please try again.");
          return;
        }

        if (!response?.success) {
          setVoteSubmitting(false);
          setError(response?.message || "Could not submit your vote.");
          return;
        }

        setVoteSubmitting(false);
        setVotingPrivate((previous) => ({
          ...previous,
          hasVoted: true,
        }));
        setVoteTarget("");
        setMessage(
          "Your vote has been submitted. Wait for God to end voting.",
        );
      },
    );
  }

  function submitTarget() {
    if (
      isFinished ||
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
                ...(myRole === "POLICE"
                  ? { actionEnabled: false }
                  : {}),
              }
            : previous,
        );

        setSelectedTarget(submittedTarget);

        if (myRole === "POLICE" && response.policeResult) {
          setLastInvestigation(response.policeResult);
          setMessage(
            response.policeResult.isMafia
              ? "Investigation complete: This player is Mafia."
              : "Investigation complete: This player is not Mafia.",
          );
        } else {
          setMessage("Your selection has been submitted successfully.");
        }
      },
    );
  }

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-3 bg-slate-950 p-6 text-white">
        {error ? (
          <p className="text-center text-red-300">{error}</p>
        ) : (
          <>
            <LoaderCircle className="animate-spin" />
            Restoring game...
          </>
        )}
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

  const allowedCandidates = votingPrivate?.candidates ?? [];

  const votingPlayers = alivePlayers.filter(
    (player) =>
      allowedCandidates.length === 0 ||
      allowedCandidates.includes(player.id),
  );

  const canChooseTarget =
    !isFinished &&
    isNight &&
    Boolean(action) &&
    Boolean(privateState?.actionEnabled) &&
    !submitting;

  const showVotingResults = Boolean(votingResult);

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

        {message && !isFinished && (
          <p
            role="status"
            className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300"
          >
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <span>{message}</span>
          </p>
        )}

        {isFinished ? (
          <WinnerPanel result={state.gameResult} players={state.players} />
        ) : (
          <>
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
                  Discuss your suspicions and wait for God to start voting.
                </p>
              )}

              {isVoting && !showVotingResults && (
                <section className="mt-6 rounded-2xl border border-indigo-500/30 bg-slate-900/80 p-6">
                  <h2 className="text-xl font-semibold">Cast your vote</h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Votes are private. No counts are shown until God ends voting.
                  </p>

                  {votingPrivate?.hasVoted ? (
                    <div className="mt-5 rounded-xl bg-emerald-500/10 p-4 text-emerald-300">
                      Vote submitted. Waiting for God to end voting.
                    </div>
                  ) : votingStatus !== "OPEN" ? (
                    <p className="mt-5 text-amber-300">
                      Voting is not currently accepting votes.
                    </p>
                  ) : (
                    <>
                      {allowedCandidates.length > 0 && (
                        <p className="mt-4 text-sm text-amber-300">
                          Revote: you may vote only for a tied candidate.
                        </p>
                      )}

                      <div className="mt-5 space-y-2">
                        {votingPlayers.map((player) => {
                          const selected = voteTarget === player.id;

                          return (
                            <button
                              key={player.id}
                              type="button"
                              onClick={() => {
                                setVoteTarget(player.id);
                                setError("");
                                setMessage("");
                              }}
                              disabled={voteSubmitting}
                              aria-pressed={selected}
                              className={`flex w-full items-center justify-between rounded-xl border p-4 text-left ${
                                selected
                                  ? "border-indigo-400 bg-indigo-500/15"
                                  : "border-slate-700 bg-slate-950"
                              } disabled:opacity-60`}
                            >
                              <span>{player.username}</span>
                              <span className="text-sm text-indigo-300">
                                {selected ? "Selected" : "Select"}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={submitVote}
                        disabled={
                          !voteTarget ||
                          voteSubmitting ||
                          !socket?.connected
                        }
                        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 font-semibold disabled:opacity-50"
                      >
                        {voteSubmitting && (
                          <LoaderCircle size={18} className="animate-spin" />
                        )}
                        {voteSubmitting ? "Submitting..." : "Submit Vote"}
                      </button>
                    </>
                  )}
                </section>
              )}

              {isVoting && showVotingResults && (
                <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900/80 p-6">
                  <h2 className="text-xl font-semibold">
                    {votingResult.outcome === "TIE"
                      ? "The vote is tied"
                      : votingResult.outcome === "NO_ELIMINATION"
                        ? "No elimination"
                        : votingResult.outcome === "GAME_OVER"
                          ? "Game finished"
                          : "Voting results"}
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Final vote counts. Individual votes remain private.
                  </p>
                  <div className="mt-4 space-y-2">
                    {(votingResult.counts ?? []).map((candidate) => (
                      <div
                        key={candidate.playerId}
                        className="flex justify-between rounded-lg bg-slate-950 p-3"
                      >
                        <span>{candidate.username}</span>
                        <span className="font-semibold text-indigo-300">
                          {candidate.count} vote
                          {candidate.count === 1 ? "" : "s"}
                        </span>
                      </div>
                    ))}
                  </div>
                  {votingResult.outcome === "TIE" && (
                    <p className="mt-4 text-sm text-amber-300">
                      God will choose a revote or no elimination.
                    </p>
                  )}
                </section>
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
                        className={`flex w-full items-center justify-between rounded-xl border p-4 text-left ${
                          selected
                            ? "border-indigo-400 bg-indigo-500/15"
                            : "border-slate-700 bg-slate-950"
                        } disabled:opacity-60`}
                      >
                        <span>{player.username}</span>
                        <span className="text-sm text-indigo-300">
                          {selected ? "Selected" : "Select"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {myRole === "DOCTOR" && (
                  <p className="mt-3 text-xs text-slate-400">
                    You may select your own name to self-save.
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
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 font-semibold disabled:opacity-50"
                >
                  {submitting && (
                    <LoaderCircle className="animate-spin" size={18} />
                  )}
                  {submitting ? "Submitting..." : action.button}
                </button>
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
                    ? "Your investigation indicates this player is Mafia."
                    : "Your investigation indicates this player is not Mafia."}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  This information is private to you.
                </p>
              </section>
            )}
          </>
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
                className="flex items-center justify-between gap-3 rounded-lg bg-slate-950 p-3"
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
          <div className="max-w-lg">
            {nightResult.eliminatedUsername ? (
              <Moon className="mx-auto text-rose-400" size={42} />
            ) : (
              <Shield className="mx-auto text-emerald-400" size={42} />
            )}
            <p className="mt-6 text-sm uppercase tracking-[0.3em] text-indigo-400">
              Morning has arrived
            </p>
            <h2 className="mt-5 text-3xl font-bold sm:text-5xl">
              {nightResult.eliminatedUsername
                ? nightResult.eliminatedUsername
                : "Nobody was eliminated"}
            </h2>
            <p className="mt-5 text-slate-300">
              {nightResult.eliminatedUsername
                ? "Didn't make it to breakfast. Their secrets stay buried... for now."
                : "The Doctor saved the target. Everyone lives to argue another day."}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}