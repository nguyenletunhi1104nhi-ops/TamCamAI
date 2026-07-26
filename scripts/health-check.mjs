const args = new Set(process.argv.slice(2));

const shouldProbeAi = args.has("--probe-ai") || args.has("--probe-gemini");
const nodeBaseUrl =
  process.env.VITE_API_BASE_URL ||
  process.env.API_BASE_URL ||
  "http://localhost:5000";
const aiBaseUrl =
  process.env.VITE_AI_SERVICE_BASE_URL ||
  process.env.AI_SERVICE_BASE_URL ||
  "http://127.0.0.1:8000";

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

async function fetchJson(name, url) {
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));

    const aiProbe = data?.ai || data?.gemini || data?.groq || {};
    const aiProbeFailed =
      name === "AI provider probe" && aiProbe.ok === false;

    return {
      name,
      url,
      ok: response.ok && !aiProbeFailed,
      status: response.status,
      durationMs: Date.now() - startedAt,
      data,
    };
  } catch (error) {
    return {
      name,
      url,
      ok: false,
      status: "unreachable",
      durationMs: Date.now() - startedAt,
      error: error.message,
    };
  }
}

function printResult(result) {
  const mark = result.ok ? "PASS" : "FAIL";
  console.log(`${mark} ${result.name} (${result.status}) ${result.durationMs}ms`);
  console.log(`     ${result.url}`);

  if (result.error) {
    console.log(`     error: ${result.error}`);
  }

  if (result.name === "AI provider probe") {
    const ai = result.data?.ai || result.data?.gemini || result.data?.groq || {};
    console.log(`     provider: ${ai.provider || result.data?.provider || "unknown"}`);
    console.log(`     model: ${ai.model || result.data?.model || "unknown"}`);
    console.log(`     keyConfigured: ${ai.keyConfigured ? "yes" : "no"}`);
    console.log(`     probe: ${ai.probe || "unknown"}`);
    if (ai.errorKind) {
      console.log(`     errorKind: ${ai.errorKind}`);
    }
    if (ai.message) {
      console.log(`     message: ${ai.message}`);
    }
  }
}

async function main() {
  const nodeUrl = `${trimTrailingSlash(nodeBaseUrl)}/api/health`;
  const aiUrl = `${trimTrailingSlash(aiBaseUrl)}/health`;
  const aiProbeUrl = `${trimTrailingSlash(aiBaseUrl)}/health?probe=ai`;
  const checks = [
    fetchJson("Node / Express", nodeUrl),
    fetchJson("FastAPI AI service", aiUrl),
  ];

  if (shouldProbeAi) {
    checks.push(fetchJson("AI provider probe", aiProbeUrl));
  }

  console.log("TamCam AI production health check");
  console.log(`Node base URL: ${nodeBaseUrl}`);
  console.log(`AI base URL: ${aiBaseUrl}`);
  console.log("");

  const results = await Promise.all(checks);
  results.forEach(printResult);

  const failed = results.filter((result) => !result.ok);

  console.log("");
  if (failed.length > 0) {
    console.error(`Health check failed: ${failed.length}/${results.length} check(s) failed.`);
    process.exitCode = 1;
    return;
  }

  console.log("All health checks passed.");
}

main();
