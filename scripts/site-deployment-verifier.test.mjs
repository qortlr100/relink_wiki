import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getDeploymentSnapshotUrl, verifySiteDeployment } from "./site-deployment-verifier.mjs";

const temporaryDirectories = /** @type {string[]} */ ([]);
const reviewedSnapshot = {
  schemaVersion: 1,
  contentRevision: "a".repeat(64),
  characters: [{ id: "character-a" }],
  weapons: [],
  sigils: [],
  skills: [],
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

/** @param {unknown} [snapshot] */
async function writeExpectedSnapshot(snapshot = reviewedSnapshot) {
  const directory = await mkdtemp(join(tmpdir(), "relink-site-verification-"));
  temporaryDirectories.push(directory);
  const snapshotPath = join(directory, "public-snapshot.v1.json");
  await writeFile(snapshotPath, JSON.stringify(snapshot));
  return snapshotPath;
}

describe("Sites deployment verifier", () => {
  it("accepts a deployed snapshot that matches the reviewed file", async () => {
    const expectedSnapshotPath = await writeExpectedSnapshot();
    const fetchImplementation = () =>
      Promise.resolve(
        new Response(JSON.stringify(reviewedSnapshot), {
          headers: { "content-type": "application/json" },
        }),
      );

    await expect(
      verifySiteDeployment({
        siteUrl: "https://relink-wiki.example/",
        expectedSnapshotPath,
        fetchImplementation,
      }),
    ).resolves.toEqual({
      code: "SITE_DEPLOYMENT_VERIFIED",
      schemaVersion: 1,
      contentRevision: "a".repeat(64),
      recordCounts: { characters: 1, weapons: 0, sigils: 0, skills: 0 },
    });
  });

  it("rejects non-origin and non-HTTPS URLs", () => {
    expect(() => getDeploymentSnapshotUrl("http://relink-wiki.example/")).toThrow("HTTPS origin");
    expect(() => getDeploymentSnapshotUrl("https://relink-wiki.example/private")).toThrow(
      "HTTPS origin",
    );
  });

  it("rejects deployment drift without returning private response content", async () => {
    const expectedSnapshotPath = await writeExpectedSnapshot();
    const fetchImplementation = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ...reviewedSnapshot,
            characters: [{ id: "unexpected-private-value" }],
          }),
        ),
      );

    await expect(
      verifySiteDeployment({
        siteUrl: "https://relink-wiki.example/",
        expectedSnapshotPath,
        fetchImplementation,
      }),
    ).rejects.toMatchObject({ code: "SITE_SNAPSHOT_MISMATCH" });
  });

  it("classifies an invalid expected snapshot separately from the deployment", async () => {
    const expectedSnapshotPath = await writeExpectedSnapshot({
      ...reviewedSnapshot,
      contentRevision: "invalid",
    });
    const fetchImplementation = () => Promise.reject(new Error("must not fetch"));

    await expect(
      verifySiteDeployment({
        siteUrl: "https://relink-wiki.example/",
        expectedSnapshotPath,
        fetchImplementation,
      }),
    ).rejects.toMatchObject({ code: "EXPECTED_SNAPSHOT_INVALID" });
  });

  it("stops reading a streamed response as soon as it exceeds the size limit", async () => {
    const expectedSnapshotPath = await writeExpectedSnapshot();
    const oversizedChunk = new Uint8Array(3 * 1024 * 1024);
    let streamCancelled = false;
    const fetchImplementation = () =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(oversizedChunk);
              controller.enqueue(oversizedChunk);
            },
            cancel() {
              streamCancelled = true;
            },
          }),
        ),
      );

    await expect(
      verifySiteDeployment({
        siteUrl: "https://relink-wiki.example/",
        expectedSnapshotPath,
        fetchImplementation,
      }),
    ).rejects.toMatchObject({ code: "SITE_SNAPSHOT_TOO_LARGE" });
    expect(streamCancelled).toBe(true);
  });

  it("rejects an unavailable deployment without reading its body", async () => {
    const expectedSnapshotPath = await writeExpectedSnapshot();
    const fetchImplementation = () =>
      Promise.resolve(new Response("private provider detail", { status: 503 }));

    await expect(
      verifySiteDeployment({
        siteUrl: "https://relink-wiki.example/",
        expectedSnapshotPath,
        fetchImplementation,
      }),
    ).rejects.toMatchObject({ code: "SITE_SNAPSHOT_UNAVAILABLE" });
  });
});
