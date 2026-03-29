import { z } from "zod";
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from "../constants.js";

export const masterPromptPlanIssueDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000).nullable().optional(),
  assigneeAgentId: z.string().uuid().nullable().optional(),
  priority: z.enum(ISSUE_PRIORITIES).optional().default("medium"),
  status: z.enum(ISSUE_STATUSES).optional().default("todo"),
  requestDepth: z.number().int().nonnegative().optional().default(0),
});

export type MasterPromptPlanIssueDraft = z.infer<typeof masterPromptPlanIssueDraftSchema>;

export const previewMasterPromptPlanSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000),
  projectId: z.string().uuid().nullable().optional(),
  goalId: z.string().uuid().nullable().optional(),
});

export type PreviewMasterPromptPlan = z.infer<typeof previewMasterPromptPlanSchema>;

export const masterPromptPlanPreviewResultSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(5_000),
  issues: z.array(masterPromptPlanIssueDraftSchema).min(1).max(12),
  warnings: z.array(z.string().trim().min(1)).default([]),
  reasoning: z.array(z.string().trim().min(1)).default([]),
  source: z.enum(["openai", "heuristic"]),
});

export type MasterPromptPlanPreviewResult = z.infer<typeof masterPromptPlanPreviewResultSchema>;

export const orgSuggestionRoleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(160),
  reportsToRole: z.string().trim().min(1).max(60).nullable().optional(),
  brief: z.string().trim().min(1).max(2_000),
});

export type OrgSuggestionRole = z.infer<typeof orgSuggestionRoleSchema>;

export const previewOrgSuggestionSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000),
  projectId: z.string().uuid().nullable().optional(),
  goalId: z.string().uuid().nullable().optional(),
});

export type PreviewOrgSuggestion = z.infer<typeof previewOrgSuggestionSchema>;

export const orgSuggestionPreviewResultSchema = z.object({
  label: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(5_000),
  prompt: z.string().trim().min(1).max(20_000),
  roles: z.array(orgSuggestionRoleSchema).min(1).max(12),
  warnings: z.array(z.string().trim().min(1)).default([]),
  reasoning: z.array(z.string().trim().min(1)).default([]),
  source: z.enum(["openai", "heuristic"]),
});

export type OrgSuggestionPreviewResult = z.infer<typeof orgSuggestionPreviewResultSchema>;

export const applyMasterPromptPlanSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  goalId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(5_000),
  issues: z.array(masterPromptPlanIssueDraftSchema).min(1).max(12),
});

export type ApplyMasterPromptPlan = z.infer<typeof applyMasterPromptPlanSchema>;
