import Link from "next/link";
import { notFound } from "next/navigation";
import {
  apiFetch,
  type Experiment,
  type FeatureFlag,
  type Project,
} from "@/app/_shared/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/_shared/ui/table";
import { Badge } from "@/app/_shared/ui/badge";

// Always fetches live data — never statically prerenderable, see app/page.tsx.
export const dynamic = "force-dynamic";

export default async function ProjectDetailPage(
  props: PageProps<"/projects/[id]">,
) {
  const { id } = await props.params;

  const project = await apiFetch<Project>(`/projects/${id}`);
  if (!project) {
    notFound();
  }

  const [flags, experiments] = await Promise.all([
    apiFetch<FeatureFlag[]>(`/projects/${id}/flags`),
    apiFetch<Experiment[]>(`/projects/${id}/experiments`),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-10 px-6 py-16">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          &larr; Projects
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{project.name}</h1>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Feature flags</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Rollout %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flags?.length ? (
              flags.map((flag) => (
                <TableRow key={flag.id}>
                  <TableCell>{flag.key}</TableCell>
                  <TableCell>
                    <Badge variant={flag.enabled ? "default" : "secondary"}>
                      {flag.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell>{flag.rolloutPercent}%</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="text-muted-foreground">
                  No feature flags yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Experiments</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {experiments?.length ? (
              experiments.map((experiment) => (
                <TableRow key={experiment.id}>
                  <TableCell>
                    <Link
                      href={`/projects/${id}/experiments/${experiment.id}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {experiment.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        experiment.status === "running"
                          ? "default"
                          : experiment.status === "completed"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {experiment.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="text-muted-foreground">
                  No experiments yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </main>
  );
}
