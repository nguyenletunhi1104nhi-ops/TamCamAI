function FormInput({ label, required, icon, type = "text", value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">
        {label} {required && <span className="text-pink-500">*</span>}
      </label>

      <div className="flex items-center gap-3 border border-pink-100 rounded-2xl px-4 py-3 bg-white">
        <span className="text-pink-500 text-xl">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full outline-none text-gray-700"
        />
      </div>
    </div>
  );
}

export default FormInput;