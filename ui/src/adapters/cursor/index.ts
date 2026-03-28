import type { UIAdapterModule } from "../types";
import { parseCursorStdoutLine } from "@stapleai/adapter-cursor-local/ui";
import { CursorLocalConfigFields } from "./config-fields";
import { buildCursorLocalConfig } from "@stapleai/adapter-cursor-local/ui";

export const cursorLocalUIAdapter: UIAdapterModule = {
  type: "cursor",
  label: "Cursor CLI (local)",
  parseStdoutLine: parseCursorStdoutLine,
  ConfigFields: CursorLocalConfigFields,
  buildAdapterConfig: buildCursorLocalConfig,
};
