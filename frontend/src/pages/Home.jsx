import { useNavigate } from "react-router-dom";
import { Crown, Users, Shield, ArrowRight, Moon } from "lucide-react";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Navbar */}
      <nav className="mx-auto flex max-w-5xl items-center justify-between border-b border-neutral-800 px-6 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          <Moon size={20} className="text-neutral-400" />
          <span className="text-sm font-semibold tracking-widest">MAFIA</span>
        </div>

        <span className="hidden text-sm text-neutral-500 sm:block">
          Trust nobody. Survive the night.
        </span>
      </nav>

      {/* Main */}
      <main className="mx-auto flex min-h-[80vh] max-w-5xl flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-8 flex items-center gap-2 border border-neutral-700 px-3 py-1.5 text-sm text-neutral-400">
          <Shield size={15} />
          Every player has a secret
        </div>

        <h1 className="max-w-3xl text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
          Someone is lying tonight.
        </h1>

        <p className="mt-6 max-w-xl text-base leading-7 text-neutral-500 sm:text-lg">
          Form alliances, uncover the truth, and survive the night.
          Can you identify the Mafia before it's too late?
        </p>

        {/* Actions */}
        <div className="mt-12 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            onClick={() => navigate("/create-room")}
            className="group border border-neutral-100 bg-neutral-100 p-6 text-left text-neutral-950 transition hover:bg-neutral-300"
          >
            <div className="flex items-center justify-between">
              <Crown size={24} />
              <ArrowRight
                className="transition group-hover:translate-x-1"
                size={20}
              />
            </div>

            <h2 className="mt-6 text-lg font-semibold">Host a Game</h2>

            <p className="mt-1 text-sm leading-6 text-neutral-600">
              Create a private room and invite your friends.
            </p>
          </button>

          <button
            onClick={() => navigate("/join-room")}
            className="group border border-neutral-800 bg-neutral-900 p-6 text-left transition hover:border-neutral-500"
          >
            <div className="flex items-center justify-between">
              <Users size={24} className="text-neutral-300" />
              <ArrowRight
                className="text-neutral-500 transition group-hover:translate-x-1 group-hover:text-white"
                size={20}
              />
            </div>

            <h2 className="mt-6 text-lg font-semibold">Join a Game</h2>

            <p className="mt-1 text-sm leading-6 text-neutral-500">
              Have an invite code? Join your friends' room.
            </p>
          </button>
        </div>

        {/* Footer note */}
        <div className="mt-12 flex items-center gap-2 text-sm text-neutral-500">
          <span className="h-2 w-2 bg-emerald-500" />
          Gather your friends. Let the game begin.
        </div>
      </main>
    </div>
  );
}