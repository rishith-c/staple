import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listCursorSkills,
  syncCursorSkills,
} from "@stapleai/adapter-cursor-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function createSkillDir(root: string, name: string) {
  const skillDir = path.join(root, name);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), `---\nname: ${name}\n---\n`, "utf8");
  return skillDir;
}

describe("cursor local skill sync", () => {
  const stapleKey = "stapleai/staple/staple";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("reports configured Staple skills and installs them into the Cursor skills home", async () => {
    const home = await makeTempDir("staple-cursor-skill-sync-");
    cleanupDirs.add(home);

    const ctx = {
      agentId: "agent-1",
      companyId: "company-1",
      adapterType: "cursor",
      config: {
        env: {
          HOME: home,
        },
        stapleSkillSync: {
          desiredSkills: [stapleKey],
        },
      },
    } as const;

    const before = await listCursorSkills(ctx);
    expect(before.mode).toBe("persistent");
    expect(before.desiredSkills).toContain(stapleKey);
    expect(before.entries.find((entry) => entry.key === stapleKey)?.required).toBe(true);
    expect(before.entries.find((entry) => entry.key === stapleKey)?.state).toBe("missing");

    const after = await syncCursorSkills(ctx, [stapleKey]);
    expect(after.entries.find((entry) => entry.key === stapleKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".cursor", "skills", "staple"))).isSymbolicLink()).toBe(true);
  });

  it("recognizes company-library runtime skills supplied outside the bundled Staple directory", async () => {
    const home = await makeTempDir("staple-cursor-runtime-skills-home-");
    const runtimeSkills = await makeTempDir("staple-cursor-runtime-skills-src-");
    cleanupDirs.add(home);
    cleanupDirs.add(runtimeSkills);

    const stapleDir = await createSkillDir(runtimeSkills, "staple");
    const asciiHeartDir = await createSkillDir(runtimeSkills, "ascii-heart");

    const ctx = {
      agentId: "agent-3",
      companyId: "company-1",
      adapterType: "cursor",
      config: {
        env: {
          HOME: home,
        },
        stapleRuntimeSkills: [
          {
            key: "staple",
            runtimeName: "staple",
            source: stapleDir,
            required: true,
            requiredReason: "Bundled Staple skills are always available for local adapters.",
          },
          {
            key: "ascii-heart",
            runtimeName: "ascii-heart",
            source: asciiHeartDir,
          },
        ],
        stapleSkillSync: {
          desiredSkills: ["ascii-heart"],
        },
      },
    } as const;

    const before = await listCursorSkills(ctx);
    expect(before.warnings).toEqual([]);
    expect(before.desiredSkills).toEqual(["staple", "ascii-heart"]);
    expect(before.entries.find((entry) => entry.key === "ascii-heart")?.state).toBe("missing");

    const after = await syncCursorSkills(ctx, ["ascii-heart"]);
    expect(after.warnings).toEqual([]);
    expect(after.entries.find((entry) => entry.key === "ascii-heart")?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".cursor", "skills", "ascii-heart"))).isSymbolicLink()).toBe(true);
  });

  it("keeps required bundled Staple skills installed even when the desired set is emptied", async () => {
    const home = await makeTempDir("staple-cursor-skill-prune-");
    cleanupDirs.add(home);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "cursor",
      config: {
        env: {
          HOME: home,
        },
        stapleSkillSync: {
          desiredSkills: [stapleKey],
        },
      },
    } as const;

    await syncCursorSkills(configuredCtx, [stapleKey]);

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

    const after = await syncCursorSkills(clearedCtx, []);
    expect(after.desiredSkills).toContain(stapleKey);
    expect(after.entries.find((entry) => entry.key === stapleKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".cursor", "skills", "staple"))).isSymbolicLink()).toBe(true);
  });
});
