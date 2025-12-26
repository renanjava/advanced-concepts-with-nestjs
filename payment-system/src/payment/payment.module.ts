import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { IdempotencyService } from './idempotency/idempotency.service';
import { SagaOrchestratorService } from './saga/saga-orchestrator.service';
import { AccountModule } from '../account/account.module';
import { GatewayModule } from '../gateway/gateway.module';
import { LedgerModule } from '../ledger/ledger.module';
import { IdempotencyRepository } from './idempotency/idempotency.repository';
import { PaymentRepository } from './payment.repository';
import { SagaExecutionRepository } from './saga/saga-execution.repository';
import { SagaStepRepository } from './saga/saga-step.repository';

@Module({
  imports: [AccountModule, GatewayModule, LedgerModule],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    IdempotencyService,
    IdempotencyRepository,
    SagaOrchestratorService,
    SagaExecutionRepository,
    SagaStepRepository,
    PaymentRepository,
  ],
})
export class PaymentModule {}
