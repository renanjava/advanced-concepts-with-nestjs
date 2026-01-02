/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { Injectable, ConflictException } from '@nestjs/common';
import { IdempotencyStatus, Payment, Prisma } from '@prisma/client';
import { IdempotencyRepository } from './idempotency.repository';

export type IdempotencyResult =
  | { status: 'NEW' }
  | { status: 'COMPLETED'; payment: Payment };

@Injectable()
export class IdempotencyService {
  constructor(private idempotencyRepository: IdempotencyRepository) {}

  async checkOrCreate(key: string): Promise<IdempotencyResult> {
    const existing = await this.idempotencyRepository.findBy(key);

    if (!existing) {
      await this.idempotencyRepository.create(key);
      return { status: 'NEW' };
    }

    if (existing.status === IdempotencyStatus.COMPLETED) {
      return {
        status: 'COMPLETED',
        payment: existing.response as unknown as Payment,
      };
    }

    if (existing.status === IdempotencyStatus.PROCESSING) {
      throw new ConflictException('Request already being processed');
    }

    await this.idempotencyRepository.update(key, IdempotencyStatus.PROCESSING);
    return { status: 'NEW' };
  }

  async markCompleted(
    key: string,
    response: any,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.idempotencyRepository.update(
      key,
      IdempotencyStatus.COMPLETED,
      response,
      tx,
    );
  }

  async markFailed(key: string, tx?: Prisma.TransactionClient): Promise<void> {
    await this.idempotencyRepository.update(key, IdempotencyStatus.FAILED, tx);
  }
}
