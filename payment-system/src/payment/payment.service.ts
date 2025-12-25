/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Payment, PaymentStatus, IdempotencyStatus } from '@prisma/client';
import { IdempotencyService } from './idempotency.service';

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async createPayment(dto: CreatePaymentDto): Promise<Payment> {
    const idempotencyCheck = await this.idempotencyService.checkOrCreate(
      dto.idempotencyKey,
    );

    if (idempotencyCheck === IdempotencyStatus.COMPLETED) {
      return idempotencyCheck;
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

      return await this.completeBothProcess(createdPayment, dto);
    } catch (error) {
      await this.prisma.payment.update({
        where: { id: paymentId! },
        data: { status: PaymentStatus.FAILED },
      });
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

  async completeBothProcess(
    paymentEntity: Payment,
    paymentDto: CreatePaymentDto,
  ) {
    await this.processPaymentSimulation();

    const completedPayment = await this.prisma.payment.update({
      where: { id: paymentEntity.id },
      data: { status: PaymentStatus.COMPLETED },
    });

    await this.idempotencyService.markCompleted(
      paymentDto.idempotencyKey,
      completedPayment,
    );

    return completedPayment;
  }
}
