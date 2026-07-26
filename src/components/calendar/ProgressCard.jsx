function ProgressCard() {
  return (
    <div className="bg-white rounded-3xl border border-pink-100 p-5 shadow-sm">
      <h3 className="font-bold mb-3">Tiến độ hôm nay</h3>

      <p className="text-3xl font-bold mb-3">75%</p>

      <div className="w-full h-2 bg-pink-100 rounded-full overflow-hidden">
        <div className="h-full w-[75%] bg-pink-500 rounded-full" />
      </div>

      <p className="text-sm text-gray-500 mt-3">6/8 task đã hoàn thành</p>
    </div>
  );
}

export default ProgressCard;