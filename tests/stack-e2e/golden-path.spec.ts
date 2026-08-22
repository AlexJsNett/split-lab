// M13 (D8) — the live cross-service golden-path test M10 deliberately
// deferred: assign -> conversion -> results, hitting the whole real stack
// running together (apps/api AND apps/event-processor both actually up,
// not each tested in isolation the way M10's two separate e2e suites do
// it). This package imports nothing from either app — the only honest
// definition of "black-box": if it could `import { AppModule }`, it
// wouldn't be one. See .agents/guides/backend/docker.md for how this
// container fits into the isolated splitlab-e2e compose stack.

// No `?? 'http://localhost:3000'` fallback on purpose — this suite only
// makes sense addressing services by name inside the splitlab-e2e compose
// network (D8). A silent localhost default would let this run against
// nothing and fail with a confusing connection-refused error instead of
// this clear one.
const STACK_BASE_URL =
  process.env.STACK_BASE_URL ??
  (() => {
    throw new Error(
      'STACK_BASE_URL is required — this suite only runs inside the splitlab-e2e compose network',
    );
  })();

interface Project {
  id: string;
  apiKey: string;
}

interface FeatureFlag {
  id: string;
}

interface Experiment {
  id: string;
}

interface Variant {
  id: string;
}

interface AssignedVariant {
  id: string;
  key: string;
}

interface VariantResult {
  variantId: string;
  key: string;
  exposures: number;
  conversions: number;
  conversionRate: number;
}

async function apiRequest<T>(
  method: string,
  path: string,
  apiKey?: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${STACK_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `${method} ${path} -> ${response.status}: ${text || '(empty body)'}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

// GET /results only becomes accurate once apps/event-processor has consumed
// and persisted the events apps/api published — assign/conversions return
// immediately after publishing, before that happens (eventual consistency
// is the entire point of this test, not something to paper over with a
// sleep). Polls until the expected totals show up, or fails loudly with the
// last observed payload instead of hanging forever.
async function waitForResults(
  path: string,
  apiKey: string,
  expectedExposures: number,
  expectedConversions: number,
  timeoutMs = 15000,
): Promise<VariantResult[]> {
  const start = Date.now();
  let last: VariantResult[] = [];

  while (Date.now() - start < timeoutMs) {
    last = await apiRequest<VariantResult[]>('GET', path, apiKey);
    const totalExposures = last.reduce((sum, r) => sum + r.exposures, 0);
    const totalConversions = last.reduce((sum, r) => sum + r.conversions, 0);
    if (
      totalExposures >= expectedExposures &&
      totalConversions >= expectedConversions
    ) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `results never reached ${expectedExposures} exposure(s)/${expectedConversions} conversion(s) ` +
      `within ${timeoutMs}ms — last observed: ${JSON.stringify(last)}`,
  );
}

describe('golden path (stack e2e)', () => {
  it('assigns a deterministic variant, records conversions, and aggregates both into /results — through the real worker', async () => {
    const project = await apiRequest<Project>('POST', '/projects', undefined, {
      name: 'stack-e2e golden path',
    });

    const flag = await apiRequest<FeatureFlag>(
      'POST',
      `/projects/${project.id}/flags`,
      project.apiKey,
      { key: 'stack-e2e-flag' },
    );

    const experiment = await apiRequest<Experiment>(
      'POST',
      `/projects/${project.id}/experiments`,
      project.apiKey,
      { name: 'stack-e2e experiment', flagId: flag.id },
    );

    const variantA = await apiRequest<Variant>(
      'POST',
      `/experiments/${experiment.id}/variants`,
      project.apiKey,
      { key: 'control', weight: 50 },
    );
    const variantB = await apiRequest<Variant>(
      'POST',
      `/experiments/${experiment.id}/variants`,
      project.apiKey,
      { key: 'treatment', weight: 50 },
    );

    await apiRequest(
      'PATCH',
      `/projects/${project.id}/experiments/${experiment.id}`,
      project.apiKey,
      { status: 'running' },
    );

    const userIds = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];
    const assignments = new Map<string, string>();
    for (const userId of userIds) {
      const variant = await apiRequest<AssignedVariant>(
        'GET',
        `/projects/${project.id}/experiments/${experiment.id}/assign?userId=${userId}`,
        project.apiKey,
      );
      expect([variantA.id, variantB.id]).toContain(variant.id);
      assignments.set(userId, variant.id);
    }

    // Deterministic bucketing (assign-variant.service.ts), proven through
    // the real stack — the same user hitting assign again gets the SAME
    // variant, not a coin flip. Every /assign call is a real exposure by
    // design (a returning user is a real repeat exposure, not a dedup
    // candidate) — this repeat call publishes one MORE exposure event, on
    // top of the userIds.length from the loop above.
    const repeat = await apiRequest<AssignedVariant>(
      'GET',
      `/projects/${project.id}/experiments/${experiment.id}/assign?userId=user-1`,
      project.apiKey,
    );
    expect(repeat.id).toEqual(assignments.get('user-1'));
    const totalExpectedExposures = userIds.length + 1;

    const resultsPath = `/projects/${project.id}/experiments/${experiment.id}/results`;

    // POST /conversions requires the exposure row to already be in Postgres
    // (LogConversionService.findExposureWithRetry's own retry budget is a
    // fixed ~375ms — nowhere near this suite's 15s poll budget). Publishing
    // is async (api -> RabbitMQ -> event-processor -> Postgres), so wait for
    // every exposure to actually land before posting conversions, instead of
    // racing the worker.
    await waitForResults(resultsPath, project.apiKey, totalExpectedExposures, 0);

    const convertingUsers = userIds.slice(0, 3); // user-1, user-2, user-3
    for (const userId of convertingUsers) {
      await apiRequest(
        'POST',
        `/projects/${project.id}/experiments/${experiment.id}/conversions`,
        project.apiKey,
        { userId },
      );
    }

    const results = await waitForResults(
      resultsPath,
      project.apiKey,
      totalExpectedExposures,
      convertingUsers.length,
    );

    const totalExposures = results.reduce((sum, r) => sum + r.exposures, 0);
    const totalConversions = results.reduce((sum, r) => sum + r.conversions, 0);
    expect(totalExposures).toEqual(totalExpectedExposures);
    expect(totalConversions).toEqual(convertingUsers.length);

    // Expected per-variant counts computed from what THIS test tracked
    // (assignments + convertingUsers), not from the /results response
    // itself — deriving "expected" from the same payload being asserted on
    // would only catch internal inconsistency, never a genuinely wrong
    // conversionRate calculation in get-results.service.ts.
    const expectedExposuresByVariant = new Map<string, number>();
    const bump = (map: Map<string, number>, variantId: string) =>
      map.set(variantId, (map.get(variantId) ?? 0) + 1);
    for (const userId of userIds) {
      bump(expectedExposuresByVariant, assignments.get(userId)!);
    }
    bump(expectedExposuresByVariant, assignments.get('user-1')!); // the repeat call

    const expectedConversionsByVariant = new Map<string, number>();
    for (const userId of convertingUsers) {
      bump(expectedConversionsByVariant, assignments.get(userId)!);
    }

    for (const result of results) {
      const expectedExposures = expectedExposuresByVariant.get(result.variantId) ?? 0;
      const expectedConversions = expectedConversionsByVariant.get(result.variantId) ?? 0;
      expect(result.exposures).toEqual(expectedExposures);
      expect(result.conversions).toEqual(expectedConversions);
      const expectedRate =
        expectedExposures === 0 ? 0 : expectedConversions / expectedExposures;
      expect(result.conversionRate).toBeCloseTo(expectedRate, 5);
    }
  });
});
