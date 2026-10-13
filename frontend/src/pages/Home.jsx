import { useNavigate } from "react-router-dom";
import { Crown, Users, Shield, ArrowRight, Moon } from "lucide-react";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0B0A12] text-white">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-5 sm:px-12">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600">
            <Moon size={22} />
          </div>

          <span className="text-xl font-bold tracking-[0.2em]">
            MAFIA
          </span>
        </div>

        <span className="hidden text-sm text-gray-400 sm:block">
          Trust nobody. Survive the night.
        </span>
      </nav>

      {/* Main */}
      <main className="mx-auto flex min-h-[80vh] max-w-6xl flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-8 flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-300">
          <Shield size={16} />
          Every player has a secret
        </div>

        <h1 className="max-w-4xl text-5xl font-black leading-tight tracking-tight sm:text-7xl">
          SOMEONE IS
          <span className="block text-violet-500">LYING TONIGHT.</span>
        </h1>

        <p className="mt-6 max-w-xl text-base leading-7 text-gray-400 sm:text-lg">
          Form alliances, uncover the truth, and survive the night.
          Can you identify the Mafia before it's too late?
        </p>

        {/* Action cards */}
        <div className="mt-12 grid w-full max-w-2xl grid-cols-1 gap-5 sm:grid-cols-2">
          <button
            onClick={() => navigate("/create-room")}
            className="group rounded-2xl border border-violet-400/30 bg-violet-600 p-7 text-left transition hover:-translate-y-1 hover:bg-violet-500"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
                <Crown size={25} />
              </div>

              <ArrowRight
                className="transition group-hover:translate-x-1"
                size={22}
              />
            </div>

            <h2 className="mt-6 text-xl font-bold">Host a Game</h2>

            <p className="mt-2 text-sm leading-6 text-violet-100">
              Create a private room and invite your friends.
            </p>
          </button>

          <button
            onClick={() => navigate("/join-room")}
            className="group rounded-2xl border border-white/10 bg-[#171520] p-7 text-left transition hover:-translate-y-1 hover:border-violet-400/50 hover:bg-[#201D2D]"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-violet-300">
                <Users size={25} />
              </div>

              <ArrowRight
                className="text-gray-400 transition group-hover:translate-x-1 group-hover:text-white"
                size={22}
              />
            </div>

            <h2 className="mt-6 text-xl font-bold">Join a Game</h2>

            <p className="mt-2 text-sm leading-6 text-gray-400">
              Have an invite code? Join your friends' room.
            </p>
          </button>
        </div>

        {/* Footer note */}
        <div className="mt-12 flex items-center gap-2 text-sm text-gray-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Gather your friends. Let the game begin.
        </div>
      </main>
    </div>
  );
}

