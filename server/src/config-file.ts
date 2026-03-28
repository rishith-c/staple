import fs from "node:fs";
import { stapleConfigSchema, type StapleConfig } from "@stapleai/shared";
import { resolveStapleConfigPath } from "./paths.js";

export function readConfigFile(): StapleConfig | null {
  const configPath = resolveStapleConfigPath();

  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return stapleConfigSchema.parse(raw);
  } catch {
    return null;
  }
}
