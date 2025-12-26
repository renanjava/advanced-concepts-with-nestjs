/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { Injectable, ConflictException } from '@nestjs/common';
import { IdempotencyStatus, Prisma } from '@prisma/client';
import { IdempotencyRepository } from './idempotency.repository';

@Injectable()
export class IdempotencyService {
  constructor(private idempotencyRepository: IdempotencyRepository) {}

  async checkOrCreate(key: string): Promise<'NEW' | 'PROCESSING' | any> {
    const existing = await this.idempotencyRepository.findBy(key);

    if (!existing) {
      await this.idempotencyRepository.create(key);
      return 'NEW';
    }

    if (existing.status === IdempotencyStatus.COMPLETED) {
      return existing.response;
    }

    if (existing.status === IdempotencyStatus.PROCESSING) {
      throw new ConflictException('Request already being processed');
    }

    await this.idempotencyRepository.update(key, IdempotencyStatus.PROCESSING);
    return 'NEW';
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
