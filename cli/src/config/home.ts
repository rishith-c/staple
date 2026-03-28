import os from "node:os";
import path from "node:path";

const DEFAULT_INSTANCE_ID = "default";
const INSTANCE_ID_RE = /^[a-zA-Z0-9_-]+$/;

export function resolveStapleHomeDir(): string {
  const envHome = process.env.STAPLE_HOME?.trim();
  if (envHome) return path.resolve(expandHomePrefix(envHome));
  return path.resolve(os.homedir(), ".staple");
}

export function resolveStapleInstanceId(override?: string): string {
  const raw = override?.trim() || process.env.STAPLE_INSTANCE_ID?.trim() || DEFAULT_INSTANCE_ID;
  if (!INSTANCE_ID_RE.test(raw)) {
    throw new Error(
      `Invalid instance id '${raw}'. Allowed characters: letters, numbers, '_' and '-'.`,
    );
  }
  return raw;
}

export function resolveStapleInstanceRoot(instanceId?: string): string {
  const id = resolveStapleInstanceId(instanceId);
  return path.resolve(resolveStapleHomeDir(), "instances", id);
}

export function resolveDefaultConfigPath(instanceId?: string): string {
  return path.resolve(resolveStapleInstanceRoot(instanceId), "config.json");
}

export function resolveDefaultContextPath(): string {
  return path.resolve(resolveStapleHomeDir(), "context.json");
}

export function resolveDefaultCliAuthPath(): string {
  return path.resolve(resolveStapleHomeDir(), "auth.json");
}

export function resolveDefaultEmbeddedPostgresDir(instanceId?: string): string {
  return path.resolve(resolveStapleInstanceRoot(instanceId), "db");
}

export function resolveDefaultLogsDir(instanceId?: string): string {
  return path.resolve(resolveStapleInstanceRoot(instanceId), "logs");
}

export function resolveDefaultSecretsKeyFilePath(instanceId?: string): string {
  return path.resolve(resolveStapleInstanceRoot(instanceId), "secrets", "master.key");
}

export function resolveDefaultStorageDir(instanceId?: string): string {
  return path.resolve(resolveStapleInstanceRoot(instanceId), "data", "storage");
}

export function resolveDefaultBackupDir(instanceId?: string): string {
  return path.resolve(resolveStapleInstanceRoot(instanceId), "data", "backups");
}

export function expandHomePrefix(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.resolve(os.homedir(), value.slice(2));
  return value;
}

export function describeLocalInstancePaths(instanceId?: string) {
  const resolvedInstanceId = resolveStapleInstanceId(instanceId);
  const instanceRoot = resolveStapleInstanceRoot(resolvedInstanceId);
  return {
    homeDir: resolveStapleHomeDir(),
    instanceId: resolvedInstanceId,
    instanceRoot,
    configPath: resolveDefaultConfigPath(resolvedInstanceId),
    embeddedPostgresDataDir: resolveDefaultEmbeddedPostgresDir(resolvedInstanceId),
    backupDir: resolveDefaultBackupDir(resolvedInstanceId),
    logDir: resolveDefaultLogsDir(resolvedInstanceId),
    secretsKeyFilePath: resolveDefaultSecretsKeyFilePath(resolvedInstanceId),
    storageDir: resolveDefaultStorageDir(resolvedInstanceId),
  };
}
