import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { PaymentGatewayService } from './payment-gateway.service';
import { PaymentGatewaySimulatorService } from './payment-gateway-simulator.service';
import { CircuitBreakerService } from './circuit-breaker.service';

@Module({
  controllers: [GatewayController],
  providers: [
    PaymentGatewayService,
    PaymentGatewaySimulatorService,
    CircuitBreakerService,
  ],
  exports: [PaymentGatewayService],
})
export class GatewayModule {}
