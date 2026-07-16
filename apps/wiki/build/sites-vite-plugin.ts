import { access, cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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

async function findHostingConfig(startDirectory: string): Promise<string> {
  let currentDirectory = resolve(startDirectory);

  for (;;) {
    const candidate = resolve(currentDirectory, ".openai", "hosting.json");
    if (await exists(candidate)) {
      return candidate;
    }

    const parentDirectory = dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      throw new Error(`Missing .openai/hosting.json at or above Vite root: ${startDirectory}`);
    }
    currentDirectory = parentDirectory;
  }
}

async function copyHostingConfig(root: string): Promise<void> {
  const outputDirectory = resolve(root, "dist", ".openai");
  const hostingConfig = await findHostingConfig(root);

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
