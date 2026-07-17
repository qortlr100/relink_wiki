import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PublicSnapshot } from "@relink-wiki/domain";
import { writePublicSnapshot } from "./snapshot-writer";

function createSnapshot(contentRevision = "a".repeat(64)): PublicSnapshot {
  return {
    schemaVersion: 1,
    contentRevision,
    generatedAt: "2026-07-15T03:00:00.000Z",
    sourceRevision: "b".repeat(64),
    extractor: { name: "GBFRDataTools", version: "2.0.0" },
    recordCounts: { characters: 1, weapons: 0, sigils: 0, skills: 0 },
    characters: [{ id: "character-1", slug: "gran", nameKo: "그랑", reviewState: "published" }],
    weapons: [],
    sigils: [],
    skills: [],
  };
}

function createInput(outputDirectory: string, snapshot = createSnapshot()) {
  return {
    snapshot,
    outputDirectory,
    writtenAt: "2026-07-15T04:00:00.000Z",
    backup: {
      reference: "NAS-20260715T033000Z",
      createdAt: "2026-07-15T03:30:00.000Z",
      sha256: "c".repeat(64),
    },
    expectedCurrentContentRevision: null,
  };
}

describe("public snapshot writer", () => {
  it("writes and re-verifies a deterministic version 1 JSON file", () => {
    const directory = mkdtempSync(join(tmpdir(), "relink-publisher-"));
    const input = createInput(directory);

    const result = writePublicSnapshot(input);
    const serialized = readFileSync(join(directory, result.fileName), "utf8");

    expect(result).toMatchObject({
      fileName: "public-snapshot.v1.json",
      contentRevision: "a".repeat(64),
      reused: false,
    });
    expect(result.outputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(serialized)).toEqual(input.snapshot);
    expect(serialized.endsWith("\n")).toBe(true);
  });

  it("reuses byte-identical output under the observed current revision", () => {
    const directory = mkdtempSync(join(tmpdir(), "relink-publisher-"));
    const input = createInput(directory);
    const first = writePublicSnapshot(input);

    const second = writePublicSnapshot({
      ...input,
      expectedCurrentContentRevision: first.contentRevision,
    });

    expect(second).toEqual({ ...first, reused: true });
  });

  it("reuses byte-identical output after a lost response with the original expectation", () => {
    const directory = mkdtempSync(join(tmpdir(), "relink-publisher-"));
    const input = createInput(directory);
    const first = writePublicSnapshot(input);

    const retried = writePublicSnapshot(input);

    expect(retried).toEqual({ ...first, reused: true });
  });

  it("refuses to overwrite a file that changed after preview", () => {
    const directory = mkdtempSync(join(tmpdir(), "relink-publisher-"));
    const first = createInput(directory);
    writePublicSnapshot(first);

    expect(() =>
      writePublicSnapshot({
        ...createInput(directory, createSnapshot("d".repeat(64))),
        expectedCurrentContentRevision: "e".repeat(64),
      }),
    ).toThrow(
      expect.objectContaining({
        code: "PUBLIC_SNAPSHOT_WRITE_CURRENT_CHANGED",
      }),
    );
  });

  it("rejects an invalid existing file instead of replacing it", () => {
    const directory = mkdtempSync(join(tmpdir(), "relink-publisher-"));
    writeFileSync(join(directory, "public-snapshot.v1.json"), "private source dump");

    expect(() => writePublicSnapshot(createInput(directory))).toThrow(
      expect.objectContaining({ code: "PUBLIC_SNAPSHOT_WRITE_CURRENT_INVALID" }),
    );
  });

  it("strips fields outside the public snapshot allowlist before writing", () => {
    const directory = mkdtempSync(join(tmpdir(), "relink-publisher-"));
    const privateValue = "system/table/chara.tbl";
    const snapshot = {
      ...createSnapshot(),
      privatePath: privateValue,
      characters: [
        {
          id: "character-1",
          slug: "gran",
          nameKo: "그랑",
          reviewState: "published" as const,
          sourceRecordId: "private-character-row",
        },
      ],
    };

    const result = writePublicSnapshot(createInput(directory, snapshot));
    const serialized = readFileSync(join(directory, result.fileName), "utf8");

    expect(serialized).not.toContain(privateValue);
    expect(serialized).not.toContain("sourceRecordId");
    expect(serialized).not.toContain("private-character-row");
  });

  it("refuses a concurrent writer lock", () => {
    const directory = mkdtempSync(join(tmpdir(), "relink-publisher-"));
    writeFileSync(join(directory, "public-snapshot.v1.json.lock"), "held");

    expect(() => writePublicSnapshot(createInput(directory))).toThrow(
      expect.objectContaining({ code: "PUBLIC_SNAPSHOT_WRITE_LOCKED" }),
    );
  });

  it("requires path-free backup evidence completed before the write", () => {
    const directory = mkdtempSync(join(tmpdir(), "relink-publisher-"));
    const privatePath = "//nas/private/relink.sqlite";

    try {
      writePublicSnapshot({
        ...createInput(directory),
        backup: {
          reference: privatePath,
          createdAt: "2026-07-15T04:00:00.001Z",
          sha256: "c".repeat(64),
        },
      });
      throw new Error("Unsafe backup evidence should fail.");
    } catch (error) {
      expect(error).toMatchObject({ code: "PUBLIC_SNAPSHOT_WRITE_INPUT_INVALID" });
      expect(JSON.stringify(error)).not.toContain(privatePath);
    }
  });

  it("rejects symlinked output directories without exposing their path", () => {
    const parent = mkdtempSync(join(tmpdir(), "relink-publisher-"));
    const target = mkdtempSync(join(tmpdir(), "relink-publisher-target-"));
    const link = join(parent, "linked-output");
    symlinkSync(target, link, "dir");

    try {
      writePublicSnapshot(createInput(link));
      throw new Error("Symlinked output should fail.");
    } catch (error) {
      expect(error).toMatchObject({ code: "PUBLIC_SNAPSHOT_WRITE_OUTPUT_DIRECTORY_INVALID" });
      expect(JSON.stringify(error)).not.toContain(link);
      expect(JSON.stringify(error)).not.toContain(target);
    }
  });
});
