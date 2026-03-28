import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listPiSkills,
  syncPiSkills,
} from "@stapleai/adapter-pi-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("pi local skill sync", () => {
  const stapleKey = "stapleai/staple/staple";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("reports configured Staple skills and installs them into the Pi skills home", async () => {
    const home = await makeTempDir("staple-pi-skill-sync-");
    cleanupDirs.add(home);

    const ctx = {
      agentId: "agent-1",
      companyId: "company-1",
      adapterType: "pi_local",
      config: {
        env: {
          HOME: home,
        },
        stapleSkillSync: {
          desiredSkills: [stapleKey],
        },
      },
    } as const;

    const before = await listPiSkills(ctx);
    expect(before.mode).toBe("persistent");
    expect(before.desiredSkills).toContain(stapleKey);
    expect(before.entries.find((entry) => entry.key === stapleKey)?.required).toBe(true);
    expect(before.entries.find((entry) => entry.key === stapleKey)?.state).toBe("missing");

    const after = await syncPiSkills(ctx, [stapleKey]);
    expect(after.entries.find((entry) => entry.key === stapleKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".pi", "agent", "skills", "staple"))).isSymbolicLink()).toBe(true);
  });

  it("keeps required bundled Staple skills installed even when the desired set is emptied", async () => {
    const home = await makeTempDir("staple-pi-skill-prune-");
    cleanupDirs.add(home);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "pi_local",
      config: {
        env: {
          HOME: home,
        },
        stapleSkillSync: {
          desiredSkills: [stapleKey],
        },
      },
    } as const;

    await syncPiSkills(configuredCtx, [stapleKey]);

    const clearedCtx = {
      ...configuredCtx,
      config: {
        env: {
          HOME: home,
        },
        stapleSkillSync: {
          desiredSkills: [],
        },
      },
    } as const;

    const after = await syncPiSkills(clearedCtx, []);
    expect(after.desiredSkills).toContain(stapleKey);
    expect(after.entries.find((entry) => entry.key === stapleKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".pi", "agent", "skills", "staple"))).isSymbolicLink()).toBe(true);
  });
});
