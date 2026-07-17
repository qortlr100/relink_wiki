import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
function isCodexAgentPreviewRuntime(): boolean {
  const runtimeRoot = process.env.CODEX_PRIMARY_RUNTIME_ROOT;
  const runtimeNode = process.env.CODEX_PRIMARY_RUNTIME_NODE;
  if (
    process.env.CODEX_SANDBOX !== "seatbelt" ||
    process.env.CODEX_NETWORK_ALLOW_LOCAL_BINDING !== "1" ||
    process.env.CODEX_SANDBOX_NETWORK_DISABLED !== "1" ||
    !runtimeRoot ||
    !runtimeNode ||
    !isAbsolute(runtimeRoot) ||
    !isAbsolute(runtimeNode)
  ) {
    return false;
  }

  try {
    const canonicalRoot = realpathSync(runtimeRoot);
    const canonicalNode = realpathSync(runtimeNode);
    return (
      canonicalRoot.startsWith("/opt/codex/runtimes/") &&
      !relative(canonicalRoot, canonicalNode).startsWith("..") &&
      canonicalNode === realpathSync(process.execPath)
    );
  } catch {
    return false;
  }
}

const isCodexAgentPreview = isCodexAgentPreviewRuntime();

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= resolve(repositoryRoot, ".wrangler", "logs");
  process.env.MINIFLARE_REGISTRY_PATH ??= resolve(repositoryRoot, ".wrangler", "registry");

  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(isCodexAgentPreview
        ? {
            // Agent preview runs inside Codex's isolated network namespace. This host
            // allowlist enables terminal.local routing; it is not an access-control boundary.
            host: "0.0.0.0",
            allowedHosts: ["terminal.local"],
            watch: { useFsEvents: false, usePolling: true },
          }
        : {}),
    },
    plugins: [
      vinext(),
      sites(repositoryRoot),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: {
          main: "./worker/index.ts",
          // Keep local Miniflare and the deployed Worker on the newest date supported
          // by the pinned workerd runtime instead of advancing with the wall clock.
          compatibility_date: "2026-05-22",
          compatibility_flags: ["nodejs_compat"],
        },
      }),
    ],
  };
});
