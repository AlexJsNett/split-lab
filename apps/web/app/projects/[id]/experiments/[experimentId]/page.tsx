import Link from "next/link";
import { notFound } from "next/navigation";
import {
  apiFetch,
  type Experiment,
  type Variant,
  type VariantResult,
} from "@/app/_shared/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/_shared/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_shared/ui/card";
import { Badge } from "@/app/_shared/ui/badge";

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export default async function ExperimentDetailPage(
  props: PageProps<"/projects/[id]/experiments/[experimentId]">,
) {
  const { id, experimentId } = await props.params;

  const experiment = await apiFetch<Experiment>(
    `/projects/${id}/experiments/${experimentId}`,
  );
  if (!experiment) {
    notFound();
  }

  const [variants, results] = await Promise.all([
    apiFetch<Variant[]>(`/experiments/${experimentId}/variants`),
    apiFetch<VariantResult[]>(
      `/projects/${id}/experiments/${experimentId}/results`,
    ),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <div>
        <Link
          href={`/projects/${id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Project
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{experiment.name}</h1>
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
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Variants</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Weight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variants?.length ? (
                variants.map((variant) => (
                  <TableRow key={variant.id}>
                    <TableCell>{variant.key}</TableCell>
                    <TableCell>{variant.weight}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    No variants yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Exposures</TableHead>
                <TableHead>Conversions</TableHead>
                <TableHead>Conversion rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results?.length ? (
                results.map((result) => (
                  <TableRow key={result.variantId}>
                    <TableCell>{result.key}</TableCell>
                    <TableCell>{result.exposures}</TableCell>
                    <TableCell>{result.conversions}</TableCell>
                    <TableCell>{formatPercent(result.conversionRate)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground">
                    No results yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
