import { Controller, Get } from "@nestjs/common";
import { HealthCheck } from "@repo/shared-types";

@Controller("health")
export class HealthController {
  private startTime = Date.now();

  @Get()
  check(): HealthCheck {
    return {
      status: "ok",
      timestamp: Date.now(),
      service: "backend",
      uptime: Date.now() - this.startTime,
    };
  }
}
