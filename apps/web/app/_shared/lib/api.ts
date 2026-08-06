export interface Project {
  id: string;
  name: string;
}

export interface FeatureFlag {
  id: string;
  projectId: string;
  key: string;
  enabled: boolean;
  rolloutPercent: number;
}

export type ExperimentStatus = "draft" | "running" | "completed";

export interface Experiment {
  id: string;
  projectId: string;
  flagId: string | null;
  name: string;
  status: ExperimentStatus;
}

export interface Variant {
  id: string;
  experimentId: string;
  key: string;
  weight: number;
}

export interface VariantResult {
  variantId: string;
  key: string;
  exposures: number;
  conversions: number;
  conversionRate: number;
}

/**
 * Thin server-side fetch wrapper around the split-lab API. Every call in
 * this app happens inside a Server Component, so `API_URL` never needs to
 * be exposed to the browser.
 *
 * Returns `null` on a non-2xx response (e.g. 404) instead of throwing, so
 * pages can call `notFound()` themselves; unexpected network errors still
 * throw so they surface as a Next.js error boundary.
 */
export async function apiFetch<T>(path: string): Promise<T | null> {
  const baseUrl = process.env.API_URL;
  if (!baseUrl) {
    throw new Error("API_URL environment variable is not set");
  }

  const res = await fetch(`${baseUrl}${path}`, { cache: "no-store" });

  if (!res.ok) {
    return null;
  }

  return (await res.json()) as T;
}
