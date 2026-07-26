import { FiSearch } from "react-icons/fi";

function SearchBar({ value = "", onChange }) {
  return (
    <div className="relative">
      <FiSearch className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" />

      <input
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder="Tìm kiếm task, mô tả, checklist..."
        className="
          w-full rounded-2xl border border-pink-100
          pl-14 pr-6 py-4 outline-none
          focus:border-pink-400
        "
      />
    </div>
  );
}

export default SearchBar;
