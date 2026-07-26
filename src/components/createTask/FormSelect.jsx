function FormSelect({ label, icon, value, onChange, options }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">
        {label}
      </label>

      <div className="flex items-center gap-3 border border-pink-100 rounded-2xl px-4 py-3 bg-white">
        <span className="text-pink-500 text-xl">{icon}</span>
        <select
          value={value}
          onChange={onChange}
          className="w-full outline-none bg-white text-gray-700"
        >
          {options.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default FormSelect;