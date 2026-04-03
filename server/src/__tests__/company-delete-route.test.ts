import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { companyRoutes } from "../routes/companies.js";
import { errorHandler } from "../middleware/index.js";

const mockCompanyService = vi.hoisted(() => ({
  list: vi.fn(),
  stats: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  ensureMembership: vi.fn(),
}));

const mockBudgetService = vi.hoisted(() => ({
  upsertPolicy: vi.fn(),
}));

const mockCompanyPortabilityService = vi.hoisted(() => ({
  exportBundle: vi.fn(),
  previewExport: vi.fn(),
  previewImport: vi.fn(),
  importBundle: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  budgetService: () => mockBudgetService,
  companyPortabilityService: () => mockCompanyPortabilityService,
  companyService: () => mockCompanyService,
  logActivity: mockLogActivity,
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "user-1",
      source: "local_implicit",
      companyIds: ["company-1"],
      isInstanceAdmin: true,
    };
    next();
  });
  app.use("/api/companies", companyRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("DELETE /api/companies/:companyId", () => {
  beforeEach(() => {
    mockCompanyService.remove.mockReset();
  });

  it("returns ok when company delete succeeds", async () => {
    mockCompanyService.remove.mockResolvedValue({ id: "company-1" });
    const app = createApp();

    const res = await request(app).delete("/api/companies/company-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockCompanyService.remove).toHaveBeenCalledWith("company-1");
  });

  it("returns 404 when company does not exist", async () => {
    mockCompanyService.remove.mockResolvedValue(null);
    const app = createApp();

    const res = await request(app).delete("/api/companies/company-1");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Company not found");
  });
});
