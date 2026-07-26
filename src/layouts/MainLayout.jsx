import Sidebar from "../components/Sidebar/Sidebar";
import Header from "../components/Header/Header";
import { Outlet } from "react-router-dom";

function MainLayout() {
  return (
    <div className="flex h-screen bg-[#fff4f8] overflow-hidden">
      <Sidebar />

      <main className="flex-1 min-w-0 h-screen overflow-hidden">
        <div className="h-full px-7 py-6 flex flex-col">
          <div className="max-w-[1280px] w-full mx-auto">
          <Header />
          </div>

          <div className="mt-6 max-w-[1280px] w-full mx-auto flex-1 min-h-0 overflow-y-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

export default MainLayout;
