import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listCodexSkills,
  syncCodexSkills,
} from "@stapleai/adapter-codex-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("codex local skill sync", () => {
  const stapleKey = "stapleai/staple/staple";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("reports configured Staple skills for workspace injection on the next run", async () => {
    const codexHome = await makeTempDir("staple-codex-skill-sync-");
    cleanupDirs.add(codexHome);

    const ctx = {
      agentId: "agent-1",
      companyId: "company-1",
      adapterType: "codex_local",
      config: {
        env: {
          CODEX_HOME: codexHome,
        },
        stapleSkillSync: {
          desiredSkills: [stapleKey],
        },
      },
    } as const;

    const before = await listCodexSkills(ctx);
    expect(before.mode).toBe("ephemeral");
    expect(before.desiredSkills).toContain(stapleKey);
    expect(before.entries.find((entry) => entry.key === stapleKey)?.required).toBe(true);
    expect(before.entries.find((entry) => entry.key === stapleKey)?.state).toBe("configured");
    expect(before.entries.find((entry) => entry.key === stapleKey)?.detail).toContain("CODEX_HOME/skills/");
  });

  it("does not persist Staple skills into CODEX_HOME during sync", async () => {
    const codexHome = await makeTempDir("staple-codex-skill-prune-");
    cleanupDirs.add(codexHome);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "codex_local",
      config: {
        env: {
          CODEX_HOME: codexHome,
        },
        stapleSkillSync: {
          desiredSkills: [stapleKey],
        },
      },
    } as const;

    const after = await syncCodexSkills(configuredCtx, [stapleKey]);
    expect(after.mode).toBe("ephemeral");
    expect(after.entries.find((entry) => entry.key === stapleKey)?.state).toBe("configured");
    await expect(fs.lstat(path.join(codexHome, "skills", "staple"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("keeps required bundled Staple skills configured even when the desired set is emptied", async () => {
    const codexHome = await makeTempDir("staple-codex-skill-required-");
    cleanupDirs.add(codexHome);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "codex_local",
      config: {
        env: {
          CODEX_HOME: codexHome,
        },
        stapleSkillSync: {
          desiredSkills: [],
        },
      },
    } as const;

    const after = await syncCodexSkills(configuredCtx, []);
    expect(after.desiredSkills).toContain(stapleKey);
    expect(after.entries.find((entry) => entry.key === stapleKey)?.state).toBe("configured");
  });

  it("normalizes legacy flat Staple skill refs before reporting configured state", async () => {
    const codexHome = await makeTempDir("staple-codex-legacy-skill-sync-");
    cleanupDirs.add(codexHome);

    const snapshot = await listCodexSkills({
      agentId: "agent-3",
      companyId: "company-1",
      adapterType: "codex_local",
      config: {
        env: {
          CODEX_HOME: codexHome,
        },
        stapleSkillSync: {
          desiredSkills: ["staple"],
        },
      },
    });

    expect(snapshot.warnings).toEqual([]);
    expect(snapshot.desiredSkills).toContain(stapleKey);
    expect(snapshot.desiredSkills).not.toContain("staple");
    expect(snapshot.entries.find((entry) => entry.key === stapleKey)?.state).toBe("configured");
    expect(snapshot.entries.find((entry) => entry.key === "staple")).toBeUndefined();
  });
});
