import { NavLink, Link, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase/firebase";
import TamCamMascot from "../brand/TamCamMascot";

import {
  FiHome,
  FiCheckSquare,
  FiCalendar,
  FiUpload,
  FiMessageCircle,
  FiBarChart2,
  FiUser,
  FiPlus,
  FiLogOut,
  FiSettings,
  FiActivity,
} from "react-icons/fi";

const menus = [
  { name: "Dashboard", path: "/dashboard", icon: <FiHome /> },
  { name: "Tasks", path: "/tasks", icon: <FiCheckSquare /> },
  { name: "Calendar", path: "/calendar", icon: <FiCalendar /> },
  { name: "Upload Document", path: "/upload", icon: <FiUpload /> },
  { name: "AI Chat", path: "/chat", icon: <FiMessageCircle /> },
  { name: "Analytics", path: "/analytics", icon: <FiBarChart2 /> },
  { name: "Profile", path: "/profile", icon: <FiUser /> },
  { name: "Settings", path: "/settings", icon: <FiSettings /> },
  { name: "System Health", path: "/health", icon: <FiActivity /> },
];

function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <aside className="w-[270px] h-screen bg-white border-r border-pink-100 p-7 flex flex-col shadow-[20px_0_60px_rgba(244,114,182,0.08)]">
      <Link to="/dashboard" className="flex items-center gap-3 mb-8">
        <TamCamMascot size="nav" alt="TamCam AI" />
        <div>
          <p className="text-2xl font-extrabold leading-none tracking-tight">
            TamCam <span className="text-pink-500">AI</span>
          </p>
          <p className="text-sm text-gray-500 mt-1">AI Study Companion</p>
        </div>
      </Link>

      <Link
        to="/create-task"
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-semibold py-4 rounded-2xl mb-8 transition shadow-lg shadow-pink-200"
      >
        <FiPlus />
        Tạo Task
      </Link>

      <nav className="space-y-2 flex-1">
        {menus.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-2xl text-base transition ${
                isActive
                  ? "bg-pink-50 text-pink-500 font-semibold shadow-sm"
                  : "text-gray-600 hover:bg-pink-50 hover:text-pink-500"
              }`
            }
          >
            <span className="text-xl">{item.icon}</span>
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div className="bg-pink-50 border border-pink-100 rounded-3xl p-5 mb-5">
        <TamCamMascot size="card" className="mx-auto" />
        <p className="font-bold text-center mt-3">TamCam AI</p>
        <p className="text-sm text-gray-600 text-center mt-1">
          Luôn đồng hành cùng bạn trong học tập và công việc.
        </p>
        <Link
          to="/chat"
          className="mt-4 block text-center bg-pink-500 text-white rounded-2xl py-3 font-semibold"
        >
          Chat với AI
        </Link>
      </div>

      <button
        onClick={handleLogout}
        className="flex items-center gap-3 px-4 py-3 rounded-2xl text-base text-gray-600 hover:bg-red-50 hover:text-red-500 transition"
      >
        <FiLogOut className="text-xl" />
        Đăng xuất
      </button>
    </aside>
  );
}

export default Sidebar;
