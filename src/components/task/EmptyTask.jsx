import { FiClipboard } from "react-icons/fi";

function EmptyTask() {
  return (
    <div className="bg-white rounded-3xl p-16 text-center">
      <FiClipboard className="text-7xl text-pink-300 mx-auto" />

      <h2 className="text-2xl font-bold mt-6">Không có Task</h2>

      <p className="text-gray-500 mt-2">
        Hãy tạo task đầu tiên của bạn.
      </p>
    </div>
  );
}

export default EmptyTask;
