import { Controller, Get } from '@nestjs/common';

// Shallow on purpose — reports "this HTTP side is up," which per main.ts's
// startAllMicroservices()-before-listen() ordering only happens once the
// RabbitMQ microservice is actually consuming (M13, D4). No RabbitMQ/DB
// pings here: this service has no ApiKeyGuard to be @Public() against
// (event-processor has no HTTP routes besides this one), and a dependency
// ping would make this container "unhealthy" for problems a restart of it
// can't fix — see apps/api's HealthController for the same reasoning.
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
