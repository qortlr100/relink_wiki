import { access, cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function copyHostingConfig(root: string, repositoryRoot: string): Promise<void> {
  const outputDirectory = resolve(root, "dist", ".openai");
  const hostingConfig = resolve(repositoryRoot, ".openai", "hosting.json");

  if (!(await exists(resolve(repositoryRoot, "pnpm-workspace.yaml")))) {
    throw new Error(`Sites repository root is not a pnpm workspace: ${repositoryRoot}`);
  }
  if (!(await exists(hostingConfig))) {
    throw new Error(`Missing .openai/hosting.json at repository root: ${repositoryRoot}`);
  }

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await cp(hostingConfig, resolve(outputDirectory, "hosting.json"));
}

export function sites(repositoryRoot: string): Plugin {
  let root = process.cwd();
  let copyHostingConfigPromise: Promise<void> | undefined;

  return {
    name: "sites",
    apply: "build",
    // Vite 8 shares this instance and calls its closeBundle hook once after all
    // environments, so the manifest copy cannot race a later environment cleanup.
    sharedDuringBuild: true,
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      copyHostingConfigPromise ??= copyHostingConfig(root, repositoryRoot);
      await copyHostingConfigPromise;
    },
  };
}
