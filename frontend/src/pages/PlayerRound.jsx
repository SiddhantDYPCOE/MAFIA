
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
  Trophy,
  Eye,
  EyeOff,
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
    <section className="mt-6 border border-amber-400/30 bg-neutral-900 p-6 text-center">
      <Trophy className="mx-auto text-amber-300" size={40} />

      <p className="mt-4 text-sm text-neutral-500">Game over</p>

      <h2 className="mt-1 text-3xl font-bold sm:text-4xl">
        {title}
      </h2>

      <p className="mt-3 text-neutral-400">
        {result?.reason ?? "The game has ended."}
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

      <div className="mt-6 border border-neutral-800 text-left">
        <p className="border-b border-neutral-800 bg-neutral-950 px-3 py-3 text-sm font-semibold text-neutral-300">
          Final roles
        </p>

        {(players ?? [])
          .filter((player) => !player.isHost)
          .map((player) => (
            <div
              key={player.id}
              className="flex items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-950 px-3 py-2.5 last:border-b-0"
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
  const [roleVisible, setRoleVisible] = useState(true);
  const [sessionPlayerId, setSessionPlayerId] = useState("");
  const [eliminationAnnouncement, setEliminationAnnouncement] =
    useState(null);

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
    let eliminationTimer;

    const clearGameTimers = () => {
      clearTimeout(nightTimer);
      clearTimeout(votingTimer);
      clearTimeout(eliminationTimer);
    };

    const handleGameRestart = (payload) => {
      if (!active) return;

      console.log("Received game:play-again event:", payload);

      const targetRoomCode = (
        payload?.roomCode || roomCode
      ).toUpperCase();

      clearGameTimers();

      // Clear finished-game state.
      setState(null);
      setMyRole(null);
      setPrivateState(null);
      setSelectedTarget("");
      setSubmitting(false);
      setError("");
      setMessage("");
      setLastInvestigation(null);
      setRoleVisible(true);
      setVotingPrivate(null);
      setVoteTarget("");
      setVoteSubmitting(false);
      setVotingResult(null);
      setNightResult(null);
      setEliminationAnnouncement(null);

      navigate(`/room/${targetRoomCode}`, { replace: true });
    };

    const mergePublicState = (nextState) => {
      if (!active || !nextState) return;

      setState((previous) => {
        const merged = {
          ...(previous ?? {}),
          ...nextState,
          players: nextState.players ?? previous?.players ?? [],
          gameResult: Object.prototype.hasOwnProperty.call(
            nextState,
            "gameResult",
          )
            ? nextState.gameResult
            : previous?.gameResult ?? null,
        };

        // If the server sends the reset lobby state, clear stale
        // game-only information before the lobby renders.
        if (
          merged.phase === "LOBBY" &&
          previous?.phase === "FINISHED"
        ) {
          merged.gameResult = null;
          merged.nightState = null;
          merged.nightStep = null;

          clearGameTimers();

          setMyRole(null);
          setPrivateState(null);
          setSelectedTarget("");
          setLastInvestigation(null);
          setVotingPrivate(null);
          setVoteTarget("");
          setVotingResult(null);
          setNightResult(null);
          setMessage("");
          setRoleVisible(true);
        }

        return merged;
      });
    };

    try {
      const raw = localStorage.getItem(`mafia_session_${roomCode}`);

      if (!raw) {
        setError("No saved session. Rejoin the room first.");
        return;
      }

      const session = JSON.parse(raw);

      if (!session?.playerId) {
        setError("Your saved session is invalid. Rejoin the room.");
        return;
      }

      setSessionPlayerId(session.playerId);

      currentSocket = connectPlayerSocket(session);

      // Important: all connected players listen for the server's
      // broadcast after God successfully restarts the game.
      currentSocket.on("game:play-again", handleGameRestart);

      currentSocket.on(
        "game:night:public-state",
        mergePublicState,
      );

      currentSocket.on(
        "game:night:phase-changed",
        (data) => {
          if (!active || !data) return;
          mergePublicState(data);
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
        clearTimeout(eliminationTimer);

        setVotingResult(result);

        // Show the announcement when a player is eliminated,
        // including when the elimination ends the game.
        if (
          ["ELIMINATED", "GAME_OVER"].includes(result.outcome) &&
          result.eliminatedUsername
        ) {
          setEliminationAnnouncement({
            username: result.eliminatedUsername,
          });

          eliminationTimer = setTimeout(() => {
            if (active) {
              setEliminationAnnouncement(null);
            }
          }, 4500);
        }

        // Keep a tie visible until God resolves it.
        if (result.outcome !== "TIE") {
          votingTimer = setTimeout(() => {
            if (active) setVotingResult(null);
          }, 4500);
        }
      });

      currentSocket.on("game:voting:revote-started", () => {
        if (!active) return;

        setVotingResult(null);
        setVoteTarget("");
        setVoteSubmitting(false);
        setVotingPrivate(null);
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
            setMyRole(null);
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
      console.error("PlayerRound initialization failed:", err);
      setError("Could not restore your room session.");
    }

    return () => {
      active = false;
      clearGameTimers();

      currentSocket?.removeAllListeners();
      currentSocket?.disconnect();
    };
  }, [roomCode, navigate]);

  const votingStatus =
    votingPrivate?.votingStatus ?? votingPrivate?.status;

  const isFinished =
    state?.phase === "FINISHED" || Boolean(state?.gameResult);

  const players = state?.players ?? [];

  const currentPlayer = players.find(
    (player) => player.id === sessionPlayerId,
  );

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
          ...(previous ?? {}),
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
          setError(
            response?.message || "Could not submit your selection.",
          );
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

  const alivePlayers = players.filter(
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
    <main className="min-h-screen bg-neutral-950 px-4 py-10 text-neutral-100">
      <div className="mx-auto max-w-xl">
        {error && (
          <p
            role="alert"
            className="mb-4 border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        {message && !isFinished && (
          <p
            role="status"
            className="mb-4 flex items-start gap-2 border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-300"
          >
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <span>{message}</span>
          </p>
        )}

        {isFinished ? (
          <WinnerPanel result={state.gameResult} players={players} />
        ) : (
          <>
            <section className="border border-neutral-800 bg-neutral-900 p-6 text-center">
              {isNight ? (
                <Moon className="mx-auto text-neutral-300" size={30} />
              ) : (
                <Sun className="mx-auto text-amber-400" size={30} />
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

              <p className="mt-2 text-sm text-neutral-500">
                Room {roomCode}
              </p>

              {currentPlayer && (
                <div className="mt-5">
                  <p className="text-sm text-neutral-400">
                    Playing as
                  </p>

                  <p className="mt-1 text-xl font-semibold text-white">
                    {currentPlayer.username}
                  </p>
                </div>
              )}

              {myRole && (
                <div className="mx-auto mt-5 max-w-sm border border-neutral-700 bg-neutral-950 p-4">
                  <p className="text-xs uppercase tracking-widest text-neutral-500">
                    Your secret role
                  </p>

                  <p className="mt-3 text-2xl font-bold tracking-wide">
                    {roleVisible ? myRole : "••••••••"}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setRoleVisible((visible) => !visible)
                    }
                    aria-pressed={!roleVisible}
                    className="mx-auto mt-4 flex items-center justify-center gap-2 border border-neutral-700 px-4 py-2 text-sm text-neutral-200 transition hover:bg-neutral-800"
                  >
                    {roleVisible ? (
                      <>
                        <EyeOff size={16} />
                        Hide role
                      </>
                    ) : (
                      <>
                        <Eye size={16} />
                        Show role
                      </>
                    )}
                  </button>
                </div>
              )}

              {isNight && !canChooseTarget && (
                <p className="mt-4 text-sm text-neutral-500">
                  Stay quiet and wait for your turn.
                </p>
              )}

              {isDiscussion && (
                <p className="mt-4 text-sm leading-relaxed text-neutral-400">
                  Discuss your suspicions and wait for God to start voting.
                </p>
              )}

              {isVoting && !showVotingResults && (
                <section className="mt-6 border border-neutral-700 bg-neutral-950 p-6 text-left">
                  <h2 className="text-xl font-semibold">Cast your vote</h2>

                  <p className="mt-2 text-sm text-neutral-500">
                    Votes are private. No counts are shown until God ends voting.
                  </p>

                  {votingPrivate?.hasVoted ? (
                    <div className="mt-5 border border-emerald-500/30 bg-emerald-500/5 p-4 text-emerald-300">
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
                              className={`flex w-full items-center justify-between border p-4 text-left transition ${selected
                                  ? "border-neutral-100 bg-neutral-800"
                                  : "border-neutral-800 bg-neutral-900 hover:border-neutral-600"
                                } disabled:opacity-60`}
                            >
                              <span>{player.username}</span>

                              <span className="text-sm text-neutral-400">
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
                        className="mt-5 flex w-full items-center justify-center gap-2 border border-neutral-100 bg-neutral-100 px-5 py-3 font-semibold text-neutral-950 transition hover:bg-neutral-300 disabled:opacity-50"
                      >
                        {voteSubmitting && (
                          <LoaderCircle
                            size={18}
                            className="animate-spin"
                          />
                        )}

                        {voteSubmitting ? "Submitting..." : "Submit Vote"}
                      </button>
                    </>
                  )}
                </section>
              )}

              {isVoting && showVotingResults && (
                <section className="mt-6 border border-neutral-700 bg-neutral-950 p-6 text-left">
                  {votingResult.outcome === "ELIMINATED" ? (
                    <div className="py-5 text-center">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center border border-red-500/30 bg-red-500/10">
                        <span className="text-3xl">⚡</span>
                      </div>

                      <p className="mt-5 text-xs uppercase tracking-[0.3em] text-red-400">
                        The town has spoken
                      </p>

                      <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl">
                        {votingResult.eliminatedUsername}
                      </h2>

                      <p className="mt-3 text-lg font-semibold text-red-300">
                        Sent to the electric chair!
                      </p>

                      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-neutral-400">
                        The player was tied to the electric chair and burned.
                        Looks like their luck finally ran out. ⚡
                      </p>

                      <p className="mt-5 text-xs text-neutral-600">
                        Their role remains a secret...
                      </p>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-xl font-semibold">
                        {votingResult.outcome === "TIE"
                          ? "The vote is tied"
                          : votingResult.outcome === "NO_ELIMINATION"
                            ? "No elimination"
                            : votingResult.outcome === "GAME_OVER"
                              ? "Game finished"
                              : "Voting results"}
                      </h2>

                      <p className="mt-2 text-sm text-neutral-500">
                        Final vote counts. Individual votes remain private.
                      </p>

                      <div className="mt-4 border border-neutral-800">
                        {(votingResult.counts ?? []).map((candidate) => (
                          <div
                            key={candidate.playerId}
                            className="flex justify-between border-b border-neutral-800 bg-neutral-900 px-3 py-2.5 last:border-b-0"
                          >
                            <span>{candidate.username}</span>

                            <span className="font-semibold text-neutral-300">
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
                    </>
                  )}
                </section>
              )}
            </section>

            {canChooseTarget && (
              <section className="mt-6 border border-neutral-800 bg-neutral-900 p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-neutral-700 text-neutral-300">
                    {myRole === "POLICE" ? (
                      <Search size={20} />
                    ) : myRole === "DOCTOR" ? (
                      <Shield size={20} />
                    ) : (
                      <Target size={20} />
                    )}
                  </div>

                  <div>
                    <h2 className="font-semibold">{action.title}</h2>

                    <p className="mt-1 text-sm text-neutral-500">
                      {action.description}
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
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
                        className={`flex w-full items-center justify-between border p-4 text-left transition ${selected
                            ? "border-neutral-100 bg-neutral-800"
                            : "border-neutral-800 bg-neutral-950 hover:border-neutral-600"
                          } disabled:opacity-60`}
                      >
                        <span>{player.username}</span>

                        <span className="text-sm text-neutral-400">
                          {selected ? "Selected" : "Select"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {myRole === "DOCTOR" && (
                  <p className="mt-3 text-xs text-neutral-500">
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
                  className="mt-5 flex w-full items-center justify-center gap-2 border border-neutral-100 bg-neutral-100 px-4 py-3 font-semibold text-neutral-950 transition hover:bg-neutral-300 disabled:opacity-50"
                >
                  {submitting && (
                    <LoaderCircle
                      className="animate-spin"
                      size={18}
                    />
                  )}

                  {submitting ? "Submitting..." : action.button}
                </button>
              </section>
            )}

            {myRole === "POLICE" && lastInvestigation && (
              <section className="mt-6 border border-neutral-800 bg-neutral-900 p-5">
                <h2 className="flex items-center gap-2 font-semibold">
                  <Search size={18} className="text-neutral-300" />
                  Latest investigation
                </h2>

                <p
                  className={`mt-3 text-sm ${lastInvestigation.isMafia
                      ? "text-red-300"
                      : "text-emerald-300"
                    }`}
                >
                  {lastInvestigation.isMafia
                    ? "Your investigation indicates this player is Mafia."
                    : "Your investigation indicates this player is not Mafia."}
                </p>

                <p className="mt-2 text-xs text-neutral-500">
                  This information is private to you.
                </p>
              </section>
            )}
          </>
        )}

        <section className="mt-6 border border-neutral-800 bg-neutral-900">
          <h2 className="flex items-center gap-2 border-b border-neutral-800 px-5 py-4 font-semibold">
            <Shield className="text-neutral-400" size={18} />
            Players
          </h2>

          <div>
            {players.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between gap-3 border-b border-neutral-800 px-5 py-3 last:border-b-0"
              >
                <span
                  className={
                    player.isAlive
                      ? "text-neutral-100"
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
          </div>
        </section>
      </div>

      {nightResult && !isFinished && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/95 px-6 text-center">
          <div className="max-w-lg">
            {nightResult.announcement === "NO_DEATH" ? (
              <Shield
                className="mx-auto text-emerald-400"
                size={40}
              />
            ) : (
              <Moon className="mx-auto text-red-400" size={40} />
            )}

            <p className="mt-6 text-sm text-neutral-500">
              Morning has arrived
            </p>

            <h2 className="mt-3 text-3xl font-bold sm:text-5xl">
              {nightResult.announcement === "NO_DEATH"
                ? "Nobody was eliminated"
                : nightResult.eliminatedUsername ||
                "A dark morning..."}
            </h2>

            <p className="mt-5 text-neutral-400">
              {nightResult.announcement === "NO_DEATH"
                ? "The Doctor saved the target. Everyone lives to argue another day."
                : "Someone didn't make it to breakfast. Their role remains secret."}
            </p>
          </div>
        </div>
      )}
      {eliminationAnnouncement && (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/95 px-6 text-center">
    <div className="w-full max-w-lg animate-pulse">
      <div className="mx-auto flex h-24 w-24 animate-bounce items-center justify-center border border-red-500/40 bg-red-500/10 shadow-[0_0_60px_rgba(239,68,68,0.2)]">
        <span className="text-6xl">⚡</span>
      </div>

      <p className="mt-8 text-xs uppercase tracking-[0.4em] text-red-400">
        The town has spoken
      </p>

      <h2 className="mt-4 text-4xl font-black text-white sm:text-6xl">
        {eliminationAnnouncement.username}
      </h2>

      <p className="mt-5 text-2xl font-bold text-red-400">
        SENT TO THE ELECTRIC CHAIR!
      </p>

      <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-neutral-300">
        Tied to the electric chair and burned! ⚡
        Looks like someone should have kept a lower profile.
      </p>

      <p className="mt-8 text-xs uppercase tracking-widest text-neutral-600">
        Their role remains a secret...
      </p>
    </div>
  </div>
)}
    </main>
  );
}
