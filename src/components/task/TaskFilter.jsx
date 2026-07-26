const filters = ["All", "Today", "Tomorrow", "This Week", "Completed"];

function TaskFilter({ activeFilter, setActiveFilter }) {
  return (
    <div className="flex flex-wrap gap-3 mb-8">
      {filters.map((filter) => (
        <button
          key={filter}
          onClick={() => setActiveFilter(filter)}
          className={`px-5 py-3 rounded-2xl font-semibold transition ${
            activeFilter === filter
              ? "bg-pink-500 text-white"
              : "bg-white text-gray-600 border border-pink-100 hover:bg-pink-50"
          }`}
        >
          {filter}
        </button>
      ))}
    </div>
  );
}

export default TaskFilter;