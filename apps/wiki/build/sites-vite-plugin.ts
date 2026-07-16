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

async function copyHostingConfig(root: string): Promise<void> {
  const outputDirectory = resolve(root, "dist", ".openai");
  const hostingConfig = resolve(root, "..", "..", ".openai", "hosting.json");

  if (!(await exists(hostingConfig))) {
    throw new Error("Missing root .openai/hosting.json");
  }

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await cp(hostingConfig, resolve(outputDirectory, "hosting.json"));
}

export function sites(): Plugin {
  let root = process.cwd();
  let copyHostingConfigPromise: Promise<void> | undefined;

  return {
    name: "sites",
    apply: "build",
    sharedDuringBuild: true,
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      copyHostingConfigPromise ??= copyHostingConfig(root);
      await copyHostingConfigPromise;
    },
  };
}
