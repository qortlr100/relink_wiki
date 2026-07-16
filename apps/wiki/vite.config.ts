import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const isCodexAgentPreview =
  process.env.CODEX_SANDBOX === "seatbelt" &&
  process.env.CODEX_NETWORK_ALLOW_LOCAL_BINDING === "1" &&
  process.env.CODEX_SANDBOX_NETWORK_DISABLED === "1";

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
          compatibility_flags: ["nodejs_compat"],
        },
      }),
    ],
  };
});
