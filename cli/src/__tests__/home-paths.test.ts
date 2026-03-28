import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  describeLocalInstancePaths,
  expandHomePrefix,
  resolveStapleHomeDir,
  resolveStapleInstanceId,
} from "../config/home.js";

const ORIGINAL_ENV = { ...process.env };

describe("home path resolution", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults to ~/.staple and default instance", () => {
    delete process.env.STAPLE_HOME;
    delete process.env.STAPLE_INSTANCE_ID;

    const paths = describeLocalInstancePaths();
    expect(paths.homeDir).toBe(path.resolve(os.homedir(), ".staple"));
    expect(paths.instanceId).toBe("default");
    expect(paths.configPath).toBe(path.resolve(os.homedir(), ".staple", "instances", "default", "config.json"));
  });

  it("supports STAPLE_HOME and explicit instance ids", () => {
    process.env.STAPLE_HOME = "~/staple-home";

    const home = resolveStapleHomeDir();
    expect(home).toBe(path.resolve(os.homedir(), "staple-home"));
    expect(resolveStapleInstanceId("dev_1")).toBe("dev_1");
  });

  it("rejects invalid instance ids", () => {
    expect(() => resolveStapleInstanceId("bad/id")).toThrow(/Invalid instance id/);
  });

  it("expands ~ prefixes", () => {
    expect(expandHomePrefix("~")).toBe(os.homedir());
    expect(expandHomePrefix("~/x/y")).toBe(path.resolve(os.homedir(), "x/y"));
  });
});
