/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Payment, PaymentStatus } from '@prisma/client';
import { IdempotencyService } from './idempotency/idempotency.service';
import { SagaOrchestratorService } from './saga/saga-orchestrator.service';
import { AggregateType, EventType } from '../ledger/events/domain-events';
import { LedgerService } from '../ledger/ledger.service';
import { PaymentRepository } from './payment.repository';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentService {
  constructor(
    private paymentRepository: PaymentRepository,
    private readonly idempotencyService: IdempotencyService,
    private sagaOrchestrator: SagaOrchestratorService,
    private ledgerService: LedgerService,
    private prisma: PrismaService,
  ) {}

  async createPayment(dto: CreatePaymentDto): Promise<Payment> {
    const idempotencyCheck = await this.idempotencyService.checkOrCreate(
      dto.idempotencyKey,
    );

    if (idempotencyCheck.status === 'COMPLETED') {
      return idempotencyCheck.payment;
    }

    let paymentId: string;

    try {
      const foundPayment = await this.paymentRepository.findBy(
        dto.idempotencyKey,
      );

      if (foundPayment && foundPayment.status === PaymentStatus.FAILED) {
        paymentId = foundPayment.id;
        await this.processPaymentSimulation();
        return await this.completeBothProcess(foundPayment, dto);
      }

      const createdPayment = await this.paymentRepository.create(dto);

      paymentId = createdPayment.id;

      await this.ledgerService.recordEvent({
        aggregateId: paymentId,
        aggregateType: AggregateType.PAYMENT,
        eventType: EventType.PAYMENT_INITIATED,
        eventData: {
          paymentId: paymentId,
          userId: dto.userId,
          amount: dto.amount,
          idempotencyKey: dto.idempotencyKey,
        },
        userId: dto.userId,
      });

      await this.sagaOrchestrator.startPaymentSaga({
        paymentId,
        userId: dto.userId,
        amount: dto.amount,
      });

      const finalPayment =
        await this.paymentRepository.findByOrThrow(paymentId);

      await this.idempotencyService.markCompleted(
        dto.idempotencyKey,
        finalPayment,
      );

      return finalPayment;
    } catch (error) {
      await this.idempotencyService.markFailed(dto.idempotencyKey);
      throw error;
    }
  }

  public async processPaymentSimulation(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (Math.random() < 0.5) {
      throw new Error('Payment gateway timeout');
    }
  }

  findSagaExecution(paymentId: string) {
    return this.sagaOrchestrator.findSagaByPaymentId(paymentId);
  }

  findAll(): Promise<Payment[]> {
    return this.paymentRepository.findAll();
  }

  findOne(id: string): Promise<Payment | null> {
    return this.paymentRepository.findBy(id);
  }

  completeBothProcess(paymentEntity: Payment, paymentDto: CreatePaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const completedPayment = await this.paymentRepository.update(
        paymentEntity.id,
        PaymentStatus.COMPLETED,
        tx,
      );

      await this.idempotencyService.markCompleted(
        paymentDto.idempotencyKey,
        this.paymentSnapshot(completedPayment),
        tx,
      );

      return completedPayment;
    });
  }

  failBothProcess(paymentId: string, paymentDto: CreatePaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const failedPayment = await this.paymentRepository.update(
        paymentId,
        PaymentStatus.FAILED,
        tx,
      );
      await this.idempotencyService.markFailed(paymentDto.idempotencyKey, tx);

      return failedPayment;
    });
  }

  paymentSnapshot(payment: Payment) {
    return {
      id: payment.id,
      userId: payment.userId,
      amount: payment.amount.toString(),
      status: payment.status,
      createdAt: payment.createdAt,
    };
  }
}
