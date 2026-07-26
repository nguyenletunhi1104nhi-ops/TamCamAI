import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  FiCamera,
  FiCheckCircle,
  FiClock,
  FiEdit3,
  FiMapPin,
  FiSave,
  FiUser,
} from "react-icons/fi";

import { auth, db } from "../../firebase/firebase";

const emptyProfile = {
  fullName: "",
  phone: "",
  address: "",
  birthday: "",
  gender: "Nữ",
};

function Profile() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [profile, setProfile] = useState(emptyProfile);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setLoading(false);
        navigate("/login");
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(
      doc(db, "users", user.uid),
      (snapshot) => {
        if (snapshot.exists()) {
          setProfile({
            ...emptyProfile,
            ...snapshot.data(),
          });
        } else {
          setProfile({
            ...emptyProfile,
            fullName: user.displayName || "",
          });
        }

        setLoading(false);
      },
      (error) => {
        console.error("Get profile error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const tasksQuery = query(
      collection(db, "tasks"),
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      tasksQuery,
      (snapshot) => {
        setTasks(
          snapshot.docs.map((taskDocument) => ({
            id: taskDocument.id,
            ...taskDocument.data(),
          }))
        );
      },
      (error) => {
        console.error("Profile tasks error:", error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const stats = useMemo(() => {
    const completed = tasks.filter(
      (task) => task.completed === true || task.status === "Completed"
    ).length;
    const inProgress = tasks.filter(
      (task) => task.status === "In Progress"
    ).length;
    const todo = tasks.filter(
      (task) => task.status === "To do" || task.status === "Pending"
    ).length;

    return {
      total: tasks.length,
      completed,
      inProgress,
      todo,
    };
  }, [tasks]);

  function updateField(field, value) {
    setProfile((currentProfile) => ({
      ...currentProfile,
      [field]: value,
    }));
  }

  function handleAvatarChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Vui lòng chọn file ảnh.");
      return;
    }

    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!user) return;

    if (!profile.fullName.trim()) {
      alert("Vui lòng nhập họ và tên.");
      return;
    }

    try {
      setSaving(true);

      await setDoc(
        doc(db, "users", user.uid),
        {
          fullName: profile.fullName.trim(),
          phone: profile.phone,
          address: profile.address,
          birthday: profile.birthday,
          gender: profile.gender,
          email: user.email,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setEditing(false);
      alert("Đã lưu thông tin hồ sơ!");
    } catch (error) {
      console.error("Save profile error:", error);
      alert("Không thể lưu hồ sơ.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-gray-500">Đang tải hồ sơ...</p>;
  }

  if (!user) return null;

  const displayName =
    profile.fullName || user.displayName || "Người dùng TamCam";

  return (
    <div className="space-y-8">
      <div>
        <p className="text-gray-500">
          Quản lý thông tin tài khoản của bạn
        </p>
      </div>

      <div className="bg-white border border-pink-100 rounded-3xl overflow-hidden shadow-sm">
        <div className="bg-pink-50 p-8">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="relative">
                <div className="w-32 h-32 rounded-full bg-white border-4 border-white shadow-sm overflow-hidden flex items-center justify-center">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-pink-200 text-pink-600 flex items-center justify-center text-5xl font-bold">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-1 right-1 w-10 h-10 rounded-full bg-pink-500 text-white flex items-center justify-center border-4 border-white"
                >
                  <FiCamera />
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </div>

              <div>
                <h2 className="text-3xl font-bold text-gray-900">
                  {displayName}
                </h2>
                <p className="text-gray-500 mt-2">{user.email}</p>

                <div className="flex items-center gap-2 mt-4 text-pink-500 font-semibold">
                  <FiUser />
                  TamCam user
                </div>

                {profile.address && (
                  <div className="flex items-center gap-2 mt-3 text-gray-500">
                    <FiMapPin />
                    {profile.address}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center justify-center gap-2 bg-white border border-pink-200 px-5 py-3 rounded-2xl font-semibold hover:bg-pink-100 transition"
            >
              <FiEdit3 className="text-pink-500" />
              Chỉnh sửa hồ sơ
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mt-8">
            <StatBox icon="📋" value={stats.total} label="Tasks" note="Tổng số task" />
            <StatBox
              icon={<FiCheckCircle />}
              value={stats.completed}
              label="Đã hoàn thành"
              note="Task hoàn thành"
            />
            <StatBox
              icon={<FiClock />}
              value={stats.inProgress}
              label="Đang thực hiện"
              note="Task đang xử lý"
            />
            <StatBox
              icon="☆"
              value={stats.todo}
              label="Chưa bắt đầu"
              note="Task cần thực hiện"
            />
          </div>
        </div>

        <div className="p-8">
          <h3 className="text-xl font-bold mb-6">Thông tin cá nhân</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ProfileInput
              label="Họ và tên"
              value={profile.fullName}
              disabled={!editing}
              onChange={(event) => updateField("fullName", event.target.value)}
            />
            <ProfileInput
              label="Số điện thoại"
              type="tel"
              value={profile.phone}
              disabled={!editing}
              onChange={(event) => updateField("phone", event.target.value)}
            />
            <ProfileInput label="Email" type="email" value={user.email || ""} disabled />
            <ProfileInput
              label="Địa chỉ"
              value={profile.address}
              disabled={!editing}
              onChange={(event) => updateField("address", event.target.value)}
            />
            <ProfileInput
              label="Ngày sinh"
              type="date"
              value={profile.birthday}
              disabled={!editing}
              onChange={(event) => updateField("birthday", event.target.value)}
            />

            <div>
              <label className="block font-semibold mb-3">Giới tính</label>
              <div className="grid grid-cols-3 gap-3">
                {["Nữ", "Nam", "Khác"].map((gender) => (
                  <button
                    key={gender}
                    type="button"
                    disabled={!editing}
                    onClick={() => updateField("gender", gender)}
                    className={`py-3 rounded-2xl border transition ${
                      profile.gender === gender
                        ? "bg-pink-50 border-pink-300 text-pink-500 font-semibold"
                        : "border-gray-200 text-gray-600"
                    } disabled:cursor-default`}
                  >
                    {gender}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {editing && (
            <div className="flex justify-center gap-4 mt-8">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-8 py-4 rounded-2xl border border-pink-200 text-pink-500 font-semibold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center justify-center gap-2 min-w-[230px] bg-pink-500 hover:bg-pink-600 text-white px-8 py-4 rounded-2xl font-semibold disabled:opacity-60"
              >
                <FiSave />
                {saving ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ icon, value, label, note }) {
  return (
    <div className="bg-white border border-pink-100 rounded-2xl p-5">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-pink-50 text-pink-500 flex items-center justify-center text-2xl">
          {icon}
        </div>
        <div>
          <p className="text-3xl font-bold">{value}</p>
          <p className="font-semibold text-gray-700">{label}</p>
        </div>
      </div>
      <p className="text-sm text-gray-500 mt-3">{note}</p>
    </div>
  );
}

function ProfileInput({ label, type = "text", value, disabled, onChange }) {
  return (
    <div>
      <label className="block font-semibold mb-3">{label}</label>
      <input
        type={type}
        value={value || ""}
        disabled={disabled}
        onChange={onChange}
        className="w-full border border-pink-100 rounded-2xl px-5 py-4 outline-none focus:border-pink-400 disabled:bg-gray-50 disabled:text-gray-500"
      />
    </div>
  );
}

export default Profile;
