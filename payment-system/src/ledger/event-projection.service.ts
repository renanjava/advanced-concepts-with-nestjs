/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEvent } from '@prisma/client';
import { EventType } from './events/domain-events';

@Injectable()
export class EventProjectionService {
  private readonly logger = new Logger(EventProjectionService.name);

  constructor(private prisma: PrismaService) {}

  async projectEvent(event: DomainEvent): Promise<void> {
    this.logger.log(`Projecting event: ${event.eventType} v${event.version}`);

    switch (event.eventType) {
      case EventType.PAYMENT_INITIATED:
        await this.projectPaymentInitiated(event);
        break;

      case EventType.FUNDS_RESERVED:
        await this.projectFundsReserved(event);
        break;

      case EventType.PAYMENT_PROCESSING:
        await this.projectPaymentProcessing(event);
        break;

      case EventType.PAYMENT_COMPLETED:
        await this.projectPaymentCompleted(event);
        break;

      case EventType.PAYMENT_FAILED:
        await this.projectPaymentFailed(event);
        break;

      case EventType.ACCOUNT_CREATED:
        await this.projectAccountCreated(event);
        break;

      case EventType.FUNDS_DEBITED:
        await this.projectFundsDebited(event);
        break;

      case EventType.FUNDS_CREDITED:
        await this.projectFundsCredited(event);
        break;

      default:
        this.logger.warn(`No projection handler for event: ${event.eventType}`);
    }
  }

  async rebuildProjections(): Promise<void> {
    this.logger.log('Rebuilding all projections...');

    await this.prisma.paymentProjection.deleteMany();
    await this.prisma.accountBalanceProjection.deleteMany();

    const events = await this.prisma.domainEvent.findMany({
      orderBy: [{ aggregateId: 'asc' }, { version: 'asc' }],
    });

    for (const event of events) {
      await this.projectEvent(event);
    }

    this.logger.log(`Projections rebuilt from ${events.length} events`);
  }

  private async projectPaymentInitiated(event: DomainEvent): Promise<void> {
    const data = event.eventData as any;

    await this.prisma.paymentProjection.create({
      data: {
        paymentId: event.aggregateId,
        userId: data.userId,
        amount: data.amount,
        status: 'PENDING',
        totalEvents: 1,
        lastEventType: event.eventType,
        lastEventAt: event.timestamp,
        createdAt: event.timestamp,
      },
    });
  }

  private async projectFundsReserved(event: DomainEvent): Promise<void> {
    const data = event.eventData as any;

    await this.prisma.paymentProjection.update({
      where: { paymentId: event.aggregateId },
      data: {
        status: 'FUNDS_RESERVED',
        reservationId: data.reservationId,
        totalEvents: { increment: 1 },
        lastEventType: event.eventType,
        lastEventAt: event.timestamp,
      },
    });
  }

  private async projectPaymentProcessing(event: DomainEvent): Promise<void> {
    const data = event.eventData as any;

    await this.prisma.paymentProjection.update({
      where: { paymentId: event.aggregateId },
      data: {
        status: 'PROCESSING',
        gatewayTxId: data.gatewayTransactionId,
        totalEvents: { increment: 1 },
        lastEventType: event.eventType,
        lastEventAt: event.timestamp,
      },
    });
  }

  private async projectPaymentCompleted(event: DomainEvent): Promise<void> {
    await this.prisma.paymentProjection.update({
      where: { paymentId: event.aggregateId },
      data: {
        status: 'COMPLETED',
        totalEvents: { increment: 1 },
        lastEventType: event.eventType,
        lastEventAt: event.timestamp,
        completedAt: event.timestamp,
      },
    });
  }

  private async projectPaymentFailed(event: DomainEvent): Promise<void> {
    await this.prisma.paymentProjection.update({
      where: { paymentId: event.aggregateId },
      data: {
        status: 'FAILED',
        totalEvents: { increment: 1 },
        lastEventType: event.eventType,
        lastEventAt: event.timestamp,
      },
    });
  }

  private async projectAccountCreated(event: DomainEvent): Promise<void> {
    const data = event.eventData as any;

    await this.prisma.accountBalanceProjection.create({
      data: {
        accountId: event.aggregateId,
        userId: data.userId,
        currentBalance: data.initialBalance,
        reservedBalance: 0,
        totalDebits: 0,
        totalCredits: data.initialBalance,
        lastEventAt: event.timestamp,
      },
    });
  }

  private async projectFundsDebited(event: DomainEvent): Promise<void> {
    const data = event.eventData as any;

    await this.prisma.accountBalanceProjection.update({
      where: { accountId: event.aggregateId },
      data: {
        currentBalance: { decrement: data.amount },
        totalDebits: { increment: data.amount },
        lastEventAt: event.timestamp,
      },
    });
  }

  private async projectFundsCredited(event: DomainEvent): Promise<void> {
    const data = event.eventData as any;

    await this.prisma.accountBalanceProjection.update({
      where: { accountId: event.aggregateId },
      data: {
        currentBalance: { increment: data.amount },
        totalCredits: { increment: data.amount },
        lastEventAt: event.timestamp,
      },
    });
  }

  getPaymentProjection(paymentId: string) {
    return this.prisma.paymentProjection.findUnique({
      where: { paymentId },
    });
  }

  getAccountProjection(userId: string) {
    return this.prisma.accountBalanceProjection.findUnique({
      where: { userId },
    });
  }

  listPaymentsByUser(userId: string) {
    return this.prisma.paymentProjection.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
