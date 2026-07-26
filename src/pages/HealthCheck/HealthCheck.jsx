import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Server,
  ShieldCheck,
  Wifi,
  XCircle,
} from "lucide-react";
import { auth } from "../../firebase/firebase";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const AI_SERVICE_BASE_URL =
  import.meta.env.VITE_AI_SERVICE_BASE_URL || "http://127.0.0.1:8000";

function StatusBadge({ ok, label }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${
        ok ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
      }`}
    >
      {ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
      {label || (ok ? "OK" : "Error")}
    </span>
  );
}

function HealthCard({ icon, title, ok, children }) {
  return (
    <section className="rounded-3xl border border-pink-100 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-50 text-pink-500">
            {icon}
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500">Production readiness check</p>
          </div>
        </div>
        <StatusBadge ok={ok} />
      </div>
      <div className="mt-5 text-sm leading-6 text-gray-600">{children}</div>
    </section>
  );
}

function HealthCheck() {
  const [loading, setLoading] = useState(false);
  const [nodeHealth, setNodeHealth] = useState(null);
  const [aiHealth, setAiHealth] = useState(null);
  const [aiProbe, setAiProbe] = useState(null);
  const [error, setError] = useState("");

  const firebaseStatus = useMemo(
    () => ({
      ok: Boolean(auth.currentUser),
      user: auth.currentUser?.email || auth.currentUser?.uid || "",
    }),
    []
  );

  async function fetchJson(url) {
    const response = await fetch(url, {
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    const providerProbeFailed =
      url.includes("probe=ai") && data?.ai?.ok === false;

    return {
      ok: response.ok && !providerProbeFailed,
      status: response.status,
      data,
    };
  }

  async function checkHealth({ probeAi = false } = {}) {
    setLoading(true);
    setError("");

    try {
      const checks = [
        fetchJson(`${API_BASE_URL}/api/health`),
        fetchJson(`${AI_SERVICE_BASE_URL}/health`),
      ];

      if (probeAi) {
        checks.push(fetchJson(`${AI_SERVICE_BASE_URL}/health?probe=ai`));
      }

      const [nodeResult, aiResult, providerResult] = await Promise.allSettled(checks);

      setNodeHealth(
        nodeResult.status === "fulfilled"
          ? nodeResult.value
          : {
              ok: false,
              error: nodeResult.reason?.message || "Node server unreachable",
            }
      );
      setAiHealth(
        aiResult.status === "fulfilled"
          ? aiResult.value
          : {
              ok: false,
              error: aiResult.reason?.message || "AI service unreachable",
            }
      );

      if (probeAi) {
        setAiProbe(
          providerResult.status === "fulfilled"
            ? providerResult.value
            : {
                ok: false,
                error: providerResult.reason?.message || "AI provider probe failed",
              }
        );
      }
    } catch (healthError) {
      setError(healthError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkHealth();
  }, []);

  const aiViaNode = nodeHealth?.data?.services?.aiService;
  const provider = aiProbe?.data?.ai || aiHealth?.data?.ai || aiHealth?.data?.gemini || {};
  const providerWasProbed = Boolean(aiProbe);
  const providerOk = Boolean(aiProbe?.ok && provider.ok);
  const providerDisplayOk = providerWasProbed ? providerOk : Boolean(provider.keyConfigured);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">System Health</h1>
          <p className="mt-2 text-gray-500">
            Kiem tra nhanh Frontend, Node server, FastAPI AI service, AI provider va Firebase Auth.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => checkHealth()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-pink-200 bg-white px-5 py-3 font-semibold text-pink-500 transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            Kiem tra lai
          </button>
          <button
            type="button"
            onClick={() => checkHealth({ probeAi: true })}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl bg-pink-500 px-5 py-3 font-semibold text-white shadow-lg shadow-pink-100 transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Activity size={18} />
            Test AI
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5 text-rose-600">
          {error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <HealthCard icon={<Wifi size={24} />} title="Frontend" ok={true}>
          <p>React page loaded in the browser.</p>
          <p className="mt-2 font-medium text-gray-800">
            API URL: <span className="font-normal text-gray-600">{API_BASE_URL}</span>
          </p>
          <p className="font-medium text-gray-800">
            AI URL: <span className="font-normal text-gray-600">{AI_SERVICE_BASE_URL}</span>
          </p>
        </HealthCard>

        <HealthCard icon={<Server size={24} />} title="Node / Express" ok={Boolean(nodeHealth?.ok)}>
          <p>Status: {nodeHealth?.status || nodeHealth?.error || "Checking..."}</p>
          <p className="mt-2">Node handles document upload and local analyzer fallback.</p>
          {nodeHealth?.data?.checkedAt && (
            <p className="mt-2 text-gray-500">
              Checked at: {new Date(nodeHealth.data.checkedAt).toLocaleString("vi-VN")}
            </p>
          )}
        </HealthCard>

        <HealthCard
          icon={<Activity size={24} />}
          title="FastAPI AI Service"
          ok={Boolean(aiHealth?.ok && aiViaNode?.ok)}
        >
          <p>Direct: {aiHealth?.status || aiHealth?.error || "Checking..."}</p>
          <p>Through Node: {aiViaNode?.status || aiViaNode?.message || "No data"}</p>
          <p className="mt-2">Service: {aiHealth?.data?.service || aiViaNode?.service || "TamCam AI Service"}</p>
        </HealthCard>

        <HealthCard icon={<Activity size={24} />} title="AI Provider" ok={providerDisplayOk}>
          <p>Provider: {provider.provider || "unknown"}</p>
          <p>Model: {provider.model || "unknown"}</p>
          <p>Key configured: {provider.keyConfigured ? "yes" : "no"}</p>
          <p>Probe: {providerWasProbed ? provider.probe || "failed" : "not-run"}</p>
          {provider.errorKind && <p>Error kind: {provider.errorKind}</p>}
          <p className="mt-2 break-words">
            Message:{" "}
            {providerWasProbed
              ? provider.message || "AI provider probe completed."
              : "Click Test AI to verify the real API call."}
          </p>
          {providerWasProbed && !providerOk && (
            <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-rose-600">
              AI provider is not production-ready yet. Fix the API key/project permission before
              relying on smart chat or document analysis.
            </div>
          )}
        </HealthCard>

        <HealthCard icon={<ShieldCheck size={24} />} title="Firebase Auth" ok={firebaseStatus.ok}>
          {firebaseStatus.ok ? (
            <p>Signed in: {firebaseStatus.user}</p>
          ) : (
            <p>No signed-in user detected in frontend.</p>
          )}
          <p className="mt-2">Firestore rules must allow each user to read/write data by userId.</p>
        </HealthCard>
      </div>

      {(!nodeHealth?.ok || !aiHealth?.ok || !firebaseStatus.ok || (providerWasProbed && !providerOk)) && (
        <div className="flex gap-3 rounded-3xl border border-amber-100 bg-amber-50 p-5 text-amber-700">
          <AlertTriangle className="mt-1 shrink-0" size={22} />
          <div>
            <p className="font-bold">There is something to check before demo.</p>
            <p className="mt-1">
              If the AI provider reports 403, check API key/project permission. If it reports 429,
              check quota/rate limit. If Node or FastAPI fails, check env variables and CORS.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default HealthCheck;
