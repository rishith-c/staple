// @vitest-environment node

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { TranscriptEntry } from "../../adapters";
import { ThemeProvider } from "../../context/ThemeContext";
import { RunTranscriptView, normalizeTranscript } from "./RunTranscriptView";

describe("RunTranscriptView", () => {
  it("keeps running command stdout inside the command fold instead of a standalone stdout block", () => {
    const entries: TranscriptEntry[] = [
      {
        kind: "tool_call",
        ts: "2026-03-12T00:00:00.000Z",
        name: "command_execution",
        toolUseId: "cmd_1",
        input: { command: "ls -la" },
      },
      {
        kind: "stdout",
        ts: "2026-03-12T00:00:01.000Z",
        text: "file-a\nfile-b",
      },
    ];

    const blocks = normalizeTranscript(entries, false);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "command_group",
      items: [{ result: "file-a\nfile-b", status: "running" }],
    });
  });

  it("renders assistant and thinking content as markdown in compact mode", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <RunTranscriptView
          density="compact"
          entries={[
            {
              kind: "assistant",
              ts: "2026-03-12T00:00:00.000Z",
              text: "Hello **world**",
            },
            {
              kind: "thinking",
              ts: "2026-03-12T00:00:01.000Z",
              text: "- first\n- second",
            },
          ]}
        />
      </ThemeProvider>,
    );

    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain("<li>first</li>");
    expect(html).toContain("<li>second</li>");
  });

  it("hides saved-session resume skip stderr from nice mode normalization", () => {
    const entries: TranscriptEntry[] = [
      {
        kind: "stderr",
        ts: "2026-03-12T00:00:00.000Z",
        text: "[staple] Skipping saved session resume for task \"PAP-485\" because wake reason is issue_assigned.",
      },
      {
        kind: "assistant",
        ts: "2026-03-12T00:00:01.000Z",
        text: "Working on the task.",
      },
    ];

    const blocks = normalizeTranscript(entries, false);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "message",
      role: "assistant",
      text: "Working on the task.",
    });
  });

  it("hides known codex model refresh stderr noise from nice mode normalization", () => {
    const entries: TranscriptEntry[] = [
      {
        kind: "stderr",
        ts: "2026-03-12T00:00:00.000Z",
        text: "STDERR2026-03-28T21:59:35.639584Z ERROR codex_core::models_manager::manager: failed to refresh available models: timeout waiting for child process to exit",
      },
      {
        kind: "assistant",
        ts: "2026-03-12T00:00:01.000Z",
        text: "Continuing with the task.",
      },
    ];

    const blocks = normalizeTranscript(entries, false);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "message",
      role: "assistant",
      text: "Continuing with the task.",
    });
  });

  it("hides known codex skill yaml stderr noise from nice mode normalization", () => {
    const entries: TranscriptEntry[] = [
      {
        kind: "stderr",
        ts: "2026-03-12T00:00:00.000Z",
        text: "STDERR2026-03-28T23:11:19.629512Z ERROR codex_core::codex: failed to load skill /Users/rishith/.codex/skills/apple-ui-design/SKILL.md: invalid YAML: mapping values are not allowed in this context at line 2 column 177",
      },
      {
        kind: "assistant",
        ts: "2026-03-12T00:00:01.000Z",
        text: "Working on the request.",
      },
    ];

    const blocks = normalizeTranscript(entries, false);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "message",
      role: "assistant",
      text: "Working on the request.",
    });
  });
});
