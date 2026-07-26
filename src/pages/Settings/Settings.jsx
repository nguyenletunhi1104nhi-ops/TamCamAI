import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  FiBell,
  FiClock,
  FiDatabase,
  FiLogOut,
  FiMoon,
  FiSave,
  FiShield,
  FiTrash2,
} from "react-icons/fi";

import { auth, db } from "../../firebase/firebase";

const defaultSettings = {
  defaultReminder: "Trước 30 phút",
  defaultTaskDuration: "90",
  aiConfirmationMode: "Luôn hỏi trước khi tạo task",
  compactTaskTitle: true,
  showConfidence: true,
  theme: "Sáng",
};

function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(
    "Notification" in window ? Notification.permission : "unsupported"
  );

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
        setSettings({
          ...defaultSettings,
          ...(snapshot.data()?.settings || {}),
        });
        setLoading(false);
      },
      (error) => {
        console.error("Get settings error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  function updateSetting(field, value) {
    setSettings((currentSettings) => ({
      ...currentSettings,
      [field]: value,
    }));
  }

  async function handleSave() {
    if (!user) return;

    try {
      setSaving(true);
      await setDoc(
        doc(db, "users", user.uid),
        {
          settings,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      alert("Đã lưu cài đặt!");
    } catch (error) {
      console.error("Save settings error:", error);
      alert("Không thể lưu cài đặt.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEnableNotification() {
    if (!("Notification" in window)) {
      alert("Trình duyệt của bạn không hỗ trợ thông báo.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === "granted") {
        new Notification("TamCam AI", {
          body: "Thông báo đã được bật thành công.",
        });
      }

      if (permission === "denied") {
        alert(
          "Thông báo đang bị chặn. Hãy bật quyền Notification trong cài đặt trình duyệt."
        );
      }
    } catch (error) {
      console.error("Notification permission error:", error);
      alert("Không thể bật thông báo.");
    }
  }

  function handleClearLocalData() {
    const confirmed = window.confirm(
      "Bạn muốn xóa lịch sử chat/file lưu cục bộ trên trình duyệt này?"
    );

    if (!confirmed) return;

    localStorage.removeItem("tamcam-chat-conversations");
    localStorage.removeItem("tamcam-chat-documents");
    alert("Đã xóa dữ liệu cục bộ trên trình duyệt.");
  }

  async function handleLogout() {
    try {
      setLoggingOut(true);
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
      alert("Đăng xuất thất bại.");
    } finally {
      setLoggingOut(false);
    }
  }

  if (loading) {
    return <p className="text-gray-500">Đang tải cài đặt...</p>;
  }

  if (!user) return null;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-gray-500">
          Quản lý cách TamCam AI nhắc việc, tạo task và lưu dữ liệu của bạn
        </p>
      </div>

      <section className="bg-white border border-pink-100 rounded-3xl p-8 shadow-sm">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <SettingIcon icon={<FiBell />} />
            <div>
              <h2 className="text-2xl font-bold">Thông báo</h2>
              <p className="text-gray-500 mt-1">
                Nhận nhắc nhở khi task sắp đến giờ hoặc có deadline quan trọng.
              </p>
              <p className="text-sm mt-3">
                Trạng thái:{" "}
                <span className="font-semibold text-pink-500">
                  {notificationPermission === "granted"
                    ? "Đã bật"
                    : notificationPermission === "denied"
                    ? "Đang bị chặn"
                    : notificationPermission === "unsupported"
                    ? "Không hỗ trợ"
                    : "Chưa cấp quyền"}
                </span>
              </p>
            </div>
          </div>

          {notificationPermission !== "granted" && (
            <button
              type="button"
              onClick={handleEnableNotification}
              className="shrink-0 bg-pink-500 hover:bg-pink-600 text-white px-6 py-3 rounded-2xl font-semibold transition"
            >
              Bật thông báo
            </button>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SettingCard
          icon={<FiClock />}
          title="Mặc định khi tạo task"
          description="Áp dụng cho task được tạo từ chat hoặc tài liệu khi người dùng chưa nói rõ."
        >
          <SettingSelect
            label="Nhắc trước"
            value={settings.defaultReminder}
            onChange={(event) =>
              updateSetting("defaultReminder", event.target.value)
            }
            options={[
              "Không nhắc",
              "Trước 10 phút",
              "Trước 30 phút",
              "Trước 1 giờ",
              "Trước 1 ngày",
            ]}
          />
          <SettingSelect
            label="Thời lượng mặc định"
            value={settings.defaultTaskDuration}
            onChange={(event) =>
              updateSetting("defaultTaskDuration", event.target.value)
            }
            options={[
              ["30", "30 phút"],
              ["60", "1 giờ"],
              ["90", "1 giờ 30 phút"],
              ["120", "2 giờ"],
            ]}
          />
        </SettingCard>

        <SettingCard
          icon={<FiShield />}
          title="Hành vi AI"
          description="Giữ TamCam AI ở chế độ an toàn: AI đề xuất trước, bạn xác nhận rồi mới tạo."
        >
          <SettingSelect
            label="Khi AI muốn tạo task"
            value={settings.aiConfirmationMode}
            onChange={(event) =>
              updateSetting("aiConfirmationMode", event.target.value)
            }
            options={[
              "Luôn hỏi trước khi tạo task",
              "Chỉ hỏi khi có lịch/deadline",
              "Chỉ tạo bản nháp",
            ]}
          />
          <SettingToggle
            label="Rút gọn tên task dài"
            checked={settings.compactTaskTitle}
            onChange={(value) => updateSetting("compactTaskTitle", value)}
          />
          <SettingToggle
            label="Hiển thị độ tin cậy"
            checked={settings.showConfidence}
            onChange={(value) => updateSetting("showConfidence", value)}
          />
        </SettingCard>

        <SettingCard
          icon={<FiMoon />}
          title="Giao diện"
          description="Tuỳ chọn giao diện cho trải nghiệm sử dụng hằng ngày."
        >
          <SettingSelect
            label="Chủ đề"
            value={settings.theme}
            onChange={(event) => updateSetting("theme", event.target.value)}
            options={["Sáng", "Tự động theo hệ thống"]}
          />
        </SettingCard>

        <SettingCard
          icon={<FiDatabase />}
          title="Dữ liệu cục bộ"
          description="Chỉ xóa lịch sử chat/file đang lưu trên trình duyệt này, không xóa Firebase."
        >
          <button
            type="button"
            onClick={handleClearLocalData}
            className="flex items-center justify-center gap-2 border border-pink-200 text-pink-500 hover:bg-pink-50 px-5 py-3 rounded-2xl font-semibold transition"
          >
            <FiTrash2 />
            Xóa dữ liệu cục bộ
          </button>
        </SettingCard>
      </section>

      <section className="flex flex-col sm:flex-row gap-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 bg-pink-500 hover:bg-pink-600 text-white px-8 py-4 rounded-2xl font-semibold disabled:opacity-60"
        >
          <FiSave />
          {saving ? "Đang lưu..." : "Lưu cài đặt"}
        </button>

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center justify-center gap-2 border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 px-8 py-4 rounded-2xl font-semibold disabled:opacity-60"
        >
          <FiLogOut />
          {loggingOut ? "Đang đăng xuất..." : "Đăng xuất"}
        </button>
      </section>
    </div>
  );
}

function SettingIcon({ icon }) {
  return (
    <div className="w-12 h-12 rounded-2xl bg-pink-50 text-pink-500 flex items-center justify-center text-xl">
      {icon}
    </div>
  );
}

function SettingCard({ icon, title, description, children }) {
  return (
    <section className="bg-white border border-pink-100 rounded-3xl p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <SettingIcon icon={icon} />
        <div className="min-w-0">
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-gray-500 mt-1 leading-6">{description}</p>
        </div>
      </div>
      <div className="mt-6 space-y-5">{children}</div>
    </section>
  );
}

function SettingSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="block font-semibold mb-2">{label}</span>
      <select
        value={value}
        onChange={onChange}
        className="w-full border border-pink-100 rounded-2xl px-4 py-3 outline-none focus:border-pink-400 bg-white"
      >
        {options.map((option) => {
          const optionValue = Array.isArray(option) ? option[0] : option;
          const optionLabel = Array.isArray(option) ? option[1] : option;

          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function SettingToggle({ label, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-4 border border-pink-100 rounded-2xl px-4 py-3 hover:bg-pink-50 transition"
    >
      <span className="font-semibold text-gray-700">{label}</span>
      <span
        className={`relative h-7 w-12 rounded-full transition ${
          checked ? "bg-pink-500" : "bg-gray-200"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </span>
    </button>
  );
}

export default Settings;
