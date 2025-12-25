/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IdempotencyStatus } from '@prisma/client';

@Injectable()
export class IdempotencyService {
  constructor(private prisma: PrismaService) {}

  async checkOrCreate(key: string): Promise<'NEW' | 'PROCESSING' | any> {
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { key },
    });

    if (!existing) {
      await this.prisma.idempotencyRecord.create({
        data: {
          key,
          status: IdempotencyStatus.PROCESSING,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return 'NEW';
    }

    if (existing.status === IdempotencyStatus.COMPLETED) {
      return existing.response;
    }

    if (existing.status === IdempotencyStatus.PROCESSING) {
      throw new ConflictException('Request already being processed');
    }

    await this.prisma.idempotencyRecord.update({
      where: { key },
      data: { status: IdempotencyStatus.PROCESSING },
    });
    return 'NEW';
  }

  async markCompleted(key: string, response: any): Promise<void> {
    await this.prisma.idempotencyRecord.update({
      where: { key },
      data: {
        status: IdempotencyStatus.COMPLETED,
        response,
      },
    });
  }

  async markFailed(key: string): Promise<void> {
    await this.prisma.idempotencyRecord.update({
      where: { key },
      data: { status: IdempotencyStatus.FAILED },
    });
  }
}
