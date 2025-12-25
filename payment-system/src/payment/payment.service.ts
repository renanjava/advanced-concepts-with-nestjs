/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Payment, PaymentStatus, IdempotencyStatus } from '@prisma/client';
import { IdempotencyService } from './idempotency.service';
import { SagaOrchestratorService } from './saga/saga-orchestrator.service';

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotencyService: IdempotencyService,
    private sagaOrchestrator: SagaOrchestratorService,
  ) {}

  async createPayment(dto: CreatePaymentDto): Promise<Payment> {
    const idempotencyCheck = await this.idempotencyService.checkOrCreate(
      dto.idempotencyKey,
    );

    if (idempotencyCheck === IdempotencyStatus.COMPLETED) {
      return idempotencyCheck;
    }

    if (idempotencyCheck === 'PROCESSING') {
      throw new Error('Request is already being processed');
    }

    let paymentId: string;

    try {
      const foundPayment = await this.prisma.payment.findUnique({
        where: {
          idempotencyKey: dto.idempotencyKey,
        },
      });

      if (foundPayment && foundPayment.status === PaymentStatus.FAILED) {
        paymentId = foundPayment.id;
        await this.processPaymentSimulation();
        return await this.completeBothProcess(foundPayment, dto);
      }

      const createdPayment = await this.prisma.payment.create({
        data: {
          userId: dto.userId,
          amount: dto.amount,
          status: PaymentStatus.PENDING,
          idempotencyKey: dto.idempotencyKey,
        },
      });

      paymentId = createdPayment.id;

      await this.sagaOrchestrator.startPaymentSaga({
        paymentId,
        userId: dto.userId,
        amount: dto.amount,
      });

      const finalPayment = await this.prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });

      await this.idempotencyService.markCompleted(
        dto.idempotencyKey,
        finalPayment,
      );

      return finalPayment;

      //await this.processPaymentSimulation();
      //return await this.completeBothProcess(createdPayment, dto);
    } catch (error) {
      //await this.failBothProcess(paymentId!, dto);
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
    return this.prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { id },
    });
  }

  completeBothProcess(paymentEntity: Payment, paymentDto: CreatePaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const completedPayment = await tx.payment.update({
        where: { id: paymentEntity.id },
        data: { status: PaymentStatus.COMPLETED },
      });

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
      const failedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.FAILED },
      });
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
