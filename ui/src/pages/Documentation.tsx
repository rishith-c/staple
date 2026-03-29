import { Link, useLocation } from "@/lib/router";
import { BookOpen, ChevronLeft, LayoutDashboard, Network, Sparkles } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { Button } from "@/components/ui/button";

export function DocumentationPage() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { selectedCompany } = useCompany();
  const location = useLocation();

  useEffect(() => {
    setBreadcrumbs([{ label: "Documentation" }]);
  }, [setBreadcrumbs]);

  const returnTo = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("returnTo") || "/overview";
  }, [location.search]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <BookOpen className="h-4 w-4" />
              Staple Documentation
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">Run AI agents like a managed team</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
              This local docs page explains the main Staple flows: companies, agents, org design, planning, projects, and how work gets sent to local agent runtimes like Codex.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to={returnTo}>
                <ChevronLeft className="mr-1.5 h-4 w-4" />
                Return to App
              </Link>
            </Button>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm leading-6 text-muted-foreground">
          This page opened in a new local tab so you can read docs without losing your place in the app.
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <DocCard
          icon={LayoutDashboard}
          title="Overview"
          body="Use the overview page for cross-company status. Use each company dashboard for company-specific runs, issues, spend, and activity."
        />
        <DocCard
          icon={Network}
          title="Org"
          body="The org page is the flowchart view. You can suggest an org, add missing roles, and send work to the AI team from there."
        />
        <DocCard
          icon={Sparkles}
          title="AI Planning"
          body="Plan With AI or the org action flow turns a master prompt into issues. Assigned issues then use the normal Staple wakeup path."
        />
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold text-foreground">Getting started</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <DocSection
            title="1. Create a company"
            body="A company is the top-level operating unit. It holds agents, projects, goals, costs, and issues."
          />
          <DocSection
            title="2. Add agents"
            body="Agents can use adapters like Codex local, Claude local, and other supported runtimes. The adapter determines how Staple wakes the agent."
          />
          <DocSection
            title="3. Shape the org"
            body="Use the org flowchart to model the team. You can add CEO, CTO, designers, engineers, and direct reports."
          />
          <DocSection
            title="4. Send work"
            body="Use a master prompt from the org page or planner. Staple creates issues and queues the assigned agents."
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold text-foreground">How execution works</h2>
        <div className="mt-4 space-y-4 text-base leading-7 text-muted-foreground">
          <p>
            The browser does not control your terminals directly. The UI talks to the Staple server, the server creates or updates issues, and the runtime layer wakes the assigned agents.
          </p>
          <p>
            If an issue is assigned to an agent using <code>codex_local</code>, Staple will try to run that task through the Codex local adapter on the machine where the Staple server is running.
          </p>
          <p>
            If a task is unassigned, or if the local adapter is not configured correctly, the issue will still exist but it will not execute automatically.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold text-foreground">Main areas of the app</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <DocSection title="Overview" body="Cross-company home view with total companies, issues, spend, and quick navigation." />
          <DocSection title="Dashboard" body="Company-specific operating dashboard for active runs, issues, budgets, and recent activity." />
          <DocSection title="Projects" body="Create, delete, and manage workstreams plus optional workspaces." />
          <DocSection title="Goals" body="Define higher-level outcomes and connect projects to them." />
          <DocSection title="Org" body="Visual hierarchy for roles, managers, and AI-generated org suggestions." />
          <DocSection title="Activity" body="Audit trail of what happened across the company." />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-xl font-semibold text-foreground">Current company</h2>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          {selectedCompany
            ? `You currently have ${selectedCompany.name} selected. Use the company rail to switch context at any time.`
            : "No company is selected right now. Open the app overview or create a company to get started."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/overview">Open Overview</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/dashboard">Open Company Dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/org">Open Org Flowchart</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function DocCard({ icon: Icon, title, body }: { icon: typeof LayoutDashboard; title: string; body: string }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <p className="mt-3 text-base leading-7 text-muted-foreground">{body}</p>
    </article>
  );
}

function DocSection({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-xl border border-border bg-muted/20 p-4">
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      <p className="mt-2 text-base leading-7 text-muted-foreground">{body}</p>
    </article>
  );
}
