import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { IdempotencyService } from './idempotency.service';
import { AccountModule } from '../account/account.module';
import { SagaOrchestratorService } from './saga/saga-orchestrator.service';

@Module({
  imports: [AccountModule],
  controllers: [PaymentController],
  providers: [PaymentService, IdempotencyService, SagaOrchestratorService],
})
export class PaymentModule {}
