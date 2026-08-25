import { Controller, Get } from '@nestjs/common';
import { Public } from '@/shared/decorators/public.decorator';

// Shallow on purpose — reports "this process is up," nothing about its
// dependencies. Postgres/RabbitMQ/Elasticsearch each have their own
// healthcheck in docker-compose; if this endpoint pinged them too, a
// dependency hiccup would mark THIS container unhealthy for a problem a
// restart of this container can't fix. Used as the compose/e2e readiness
// gate (M13) — see .agents/guides/backend/docker.md.
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
// M14 step 6: verify deploy/smoke fire correctly when web is path-filtered out (backend-only change)
