import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { Building2, CircleDot, DollarSign, LayoutDashboard, Network, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { queryKeys } from "../lib/queryKeys";
import { useEffect, useMemo } from "react";
import { formatCents } from "../lib/utils";

export function Overview() {
  const { companies, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { openOnboarding, openNewProject } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Overview" }]);
  }, [setBreadcrumbs]);

  const { data: stats } = useQuery({
    queryKey: queryKeys.companies.stats,
    queryFn: () => companiesApi.stats(),
  });

  const totals = useMemo(() => {
    return companies.reduce(
      (acc, company) => {
        acc.spent += company.spentMonthlyCents ?? 0;
        acc.budget += company.budgetMonthlyCents ?? 0;
        acc.agents += stats?.[company.id]?.agentCount ?? 0;
        acc.issues += stats?.[company.id]?.issueCount ?? 0;
        return acc;
      },
      { spent: 0, budget: 0, agents: 0, issues: 0 },
    );
  }, [companies, stats]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <LayoutDashboard className="h-4 w-4" />
              Main Dashboard
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">Overview of your Staple workspace</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
              Use this page as the app home. It gives you a cross-company view without dropping you into companies management first.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openNewProject}>
              <Plus className="mr-1.5 h-4 w-4" />
              New project
            </Button>
            <Button onClick={() => openOnboarding()}>
              <Plus className="mr-1.5 h-4 w-4" />
              New company
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OverviewCard icon={Building2} title="Companies" value={String(companies.length)} detail="Active operating spaces" />
        <OverviewCard icon={Network} title="Agents" value={String(totals.agents)} detail="Across all companies" />
        <OverviewCard icon={CircleDot} title="Issues" value={String(totals.issues)} detail="Tracked work items" />
        <OverviewCard
          icon={DollarSign}
          title="Month spend"
          value={formatCents(totals.spent)}
          detail={totals.budget > 0 ? `${formatCents(totals.budget)} budgeted` : "No overall budget set"}
        />
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Companies</h2>
            <p className="mt-1 text-base leading-7 text-muted-foreground">
              Jump directly into a company dashboard or open the company management view.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/companies">Manage companies</Link>
          </Button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {companies.map((company) => {
            const companyStats = stats?.[company.id];
            const isSelected = company.id === selectedCompanyId;
            return (
              <article key={company.id} className="rounded-2xl border border-border bg-muted/20 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{company.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{company.issuePrefix}</p>
                  </div>
                  {isSelected ? (
                    <span className="rounded-full bg-accent px-2 py-1 text-xs font-medium text-foreground">Selected</span>
                  ) : null}
                </div>
                {company.description ? (
                  <p className="mt-3 text-base leading-7 text-muted-foreground">{company.description}</p>
                ) : null}
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                  <div>{companyStats?.agentCount ?? 0} agents</div>
                  <div>{companyStats?.issueCount ?? 0} issues</div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedCompanyId(company.id)}
                  >
                    Select
                  </Button>
                  <Button asChild size="sm">
                    <Link to="/dashboard" onClick={() => setSelectedCompanyId(company.id)}>
                      Open dashboard
                    </Link>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function OverviewCard({
  icon: Icon,
  title,
  value,
  detail,
}: {
  icon: typeof LayoutDashboard;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <div className="mt-4 text-3xl font-semibold text-foreground">{value}</div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </article>
  );
}
