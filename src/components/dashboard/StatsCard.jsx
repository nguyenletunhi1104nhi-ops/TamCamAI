function StatsCard({ title, value, note, icon, tone = "pink", trend }) {
  const tones = {
    pink: "bg-pink-100 text-pink-500",
    orange: "bg-orange-100 text-orange-500",
    green: "bg-green-100 text-green-500",
    purple: "bg-purple-100 text-purple-500",
  };

  return (
    <div className="bg-white border border-pink-100 rounded-3xl p-6 shadow-sm hover:shadow-lg hover:shadow-pink-100 transition">
      <div className="flex items-center justify-between">
        <div
          className={`w-16 h-16 rounded-3xl ${
            tones[tone] || tones.pink
          } flex items-center justify-center text-3xl`}
        >
          {icon}
        </div>

        <div className="text-right">
          <p className="text-gray-600">{title}</p>
          <h3 className="text-4xl font-bold mt-2">{value}</h3>
        </div>
      </div>

      <p className="text-gray-500 text-sm mt-5">
        {trend && <span className="text-green-500 font-semibold">{trend} </span>}
        {note}
      </p>
    </div>
  );
}

export default StatsCard;
