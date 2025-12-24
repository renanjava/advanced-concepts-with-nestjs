import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { IdempotencyService } from './idempotency.service';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, IdempotencyService],
})
export class PaymentModule {}
