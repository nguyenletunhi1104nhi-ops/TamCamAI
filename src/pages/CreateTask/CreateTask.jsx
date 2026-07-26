import { Link } from "react-router-dom";
import { FiArrowLeft, FiSearch } from "react-icons/fi";

import CreateTaskForm from "../../components/createTask/CreateTaskForm";
import AISuggestionBox from "../../components/createTask/AISuggestionBox";
import TaskTemplateBox from "../../components/createTask/TaskTemplateBox";

function CreateTask() {
  return (
    <div className="space-y-7">
      <div className="bg-white rounded-3xl p-5 border border-pink-100 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/tasks"
            className="w-12 h-12 rounded-2xl bg-pink-50 flex items-center justify-center text-xl hover:bg-pink-100"
          >
            <FiArrowLeft />
          </Link>

          <div>
            <h1 className="text-3xl font-bold">Create Task</h1>
            <p className="text-gray-500 mt-1">Tạo nhiệm vụ mới</p>
          </div>
        </div>

        <div className="hidden md:flex w-[360px] border border-pink-100 rounded-2xl px-5 py-3.5 items-center gap-3 text-gray-400">
          <span className="flex-1">Tìm kiếm nhiệm vụ...</span>
          <FiSearch />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-8">
        <CreateTaskForm />

        <div className="space-y-6">
          <AISuggestionBox />
          <TaskTemplateBox />
        </div>
      </div>
    </div>
  );
}

export default CreateTask;
