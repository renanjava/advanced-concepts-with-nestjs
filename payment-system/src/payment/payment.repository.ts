import { Injectable } from '@nestjs/common';
import { Payment, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findBy(idempotencyKey: string): Promise<Payment | null> {
    return await this.prismaService.payment.findUnique({
      where: { idempotencyKey },
    });
  }

  async create(dto: CreatePaymentDto): Promise<Payment> {
    return await this.prismaService.payment.create({
      data: {
        ...dto,
        status: PaymentStatus.PENDING,
      },
    });
  }

  async findByOrThrow(id: string): Promise<Payment> {
    return await this.prismaService.payment.findUniqueOrThrow({
      where: { id },
    });
  }

  async findAll(): Promise<Payment[]> {
    return await this.prismaService.payment.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    status: PaymentStatus,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prismaService;

    return await client.payment.update({
      where: { id },
      data: { status },
    });
  }
}
