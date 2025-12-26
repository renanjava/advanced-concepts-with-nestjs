import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { IdempotencyService } from './idempotency.service';
import { SagaOrchestratorService } from './saga/saga-orchestrator.service';
import { AccountModule } from '../account/account.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [AccountModule, GatewayModule],
  controllers: [PaymentController],
  providers: [PaymentService, IdempotencyService, SagaOrchestratorService],
})
export class PaymentModule {}
