/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Payment, PaymentStatus } from '@prisma/client';

@Injectable()
export class PaymentService {
  constructor(private readonly prisma: PrismaService) {}

  async createPayment(dto: CreatePaymentDto): Promise<Payment> {
    const payment = await this.prisma.payment.create({
      data: {
        userId: dto.userId,
        amount: dto.amount,
        status: PaymentStatus.PENDING,
      },
    });

    try {
      await this.processPaymentSimulation();

      return await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.COMPLETED },
      });
    } catch (error) {
      return await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          errorMessage: error.message,
        },
      });
    }
  }

  private async processPaymentSimulation(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (Math.random() < 0.2) {
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
}
