import { Injectable } from '@nestjs/common';
import { IdempotencyRecord, IdempotencyStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class IdempotencyRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findBy(key: string): Promise<IdempotencyRecord | null> {
    return await this.prismaService.idempotencyRecord.findUnique({
      where: { key },
    });
  }

  async create(key: string): Promise<IdempotencyRecord> {
    return await this.prismaService.idempotencyRecord.create({
      data: {
        key,
        status: IdempotencyStatus.PROCESSING,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  async update(
    key: string,
    status: IdempotencyStatus,
    response?: Record<string, any>,
    tx?: Prisma.TransactionClient,
  ): Promise<IdempotencyRecord> {
    const client = tx ?? this.prismaService;

    return await client.idempotencyRecord.update({
      where: { key },
      data: { status, response },
    });
  }
}
