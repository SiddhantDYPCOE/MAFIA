
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "../pages/Home";
import CreateRoom from "../pages/CreateRoom";
import JoinRoom from "../pages/JoinRoom";
import RoomLobby from "../pages/RoomLobby";
import DeletedLobby from "../pages/DeletedLobby";


export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create-room" element={<CreateRoom />} />
        <Route path="/join-room" element={<JoinRoom />} />
        <Route path="/room/:roomCode" element={<RoomLobby />} />
        <Route path="/deleted" element={<DeletedLobby />} />

        <Route
          path="*"
          element={
            <div className="flex min-h-screen items-center justify-center bg-[#0B0A12] text-white">
              <div className="text-center">
                <h1 className="text-4xl font-bold">404</h1>
                <p className="mt-2 text-gray-400">Page not found.</p>
                <a
                  href="/"
                  className="mt-5 inline-block text-violet-400 hover:text-violet-300"
                >
                  Back to home
                </a>
              </div>
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

