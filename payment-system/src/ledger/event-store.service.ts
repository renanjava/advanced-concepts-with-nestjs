/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEventData, AggregateType } from './events/domain-events';
import { DomainEvent } from '@prisma/client';

@Injectable()
export class EventStoreService {
  private readonly logger = new Logger(EventStoreService.name);

  constructor(private prisma: PrismaService) {}

  async saveEvent(eventData: DomainEventData): Promise<DomainEvent> {
    const currentVersion = await this.getLatestVersion(
      eventData.aggregateId,
      eventData.aggregateType,
    );

    const nextVersion = currentVersion + 1;

    const event = await this.prisma.domainEvent.create({
      data: {
        aggregateId: eventData.aggregateId,
        aggregateType: eventData.aggregateType,
        eventType: eventData.eventType,
        eventData: eventData.eventData,
        version: nextVersion,
        userId: eventData.userId,
        metadata: eventData.metadata || {},
      },
    });

    this.logger.log(
      `Event saved: ${eventData.eventType} v${nextVersion} for ${eventData.aggregateType}:${eventData.aggregateId}`,
    );

    return event;
  }

  async saveEvents(events: DomainEventData[]): Promise<DomainEvent[]> {
    const savedEvents: DomainEvent[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const eventData of events) {
        const currentVersion = await this.getLatestVersion(
          eventData.aggregateId,
          eventData.aggregateType,
          tx,
        );

        const event = await tx.domainEvent.create({
          data: {
            aggregateId: eventData.aggregateId,
            aggregateType: eventData.aggregateType,
            eventType: eventData.eventType,
            eventData: eventData.eventData,
            version: currentVersion + 1,
            userId: eventData.userId,
            metadata: eventData.metadata || {},
          },
        });

        savedEvents.push(event);
      }
    });

    this.logger.log(`${savedEvents.length} events saved in transaction`);
    return savedEvents;
  }

  getEventsByAggregate(
    aggregateId: string,
    aggregateType: AggregateType,
  ): Promise<DomainEvent[]> {
    return this.prisma.domainEvent.findMany({
      where: {
        aggregateId,
        aggregateType,
      },
      orderBy: { version: 'asc' },
    });
  }

  getEventsAfterVersion(
    aggregateId: string,
    aggregateType: AggregateType,
    afterVersion: number,
  ): Promise<DomainEvent[]> {
    return this.prisma.domainEvent.findMany({
      where: {
        aggregateId,
        aggregateType,
        version: { gt: afterVersion },
      },
      orderBy: { version: 'asc' },
    });
  }

  getEventsByType(
    eventType: string,
    limit: number = 100,
  ): Promise<DomainEvent[]> {
    return this.prisma.domainEvent.findMany({
      where: { eventType },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  getEventsByDateRange(startDate: Date, endDate: Date): Promise<DomainEvent[]> {
    return this.prisma.domainEvent.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { timestamp: 'asc' },
    });
  }

  getEventsByUser(userId: string): Promise<DomainEvent[]> {
    return this.prisma.domainEvent.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
    });
  }

  private async getLatestVersion(
    aggregateId: string,
    aggregateType: AggregateType,
    tx?: any,
  ): Promise<number> {
    const prisma = tx || this.prisma;

    const lastEvent = await prisma.domainEvent.findFirst({
      where: {
        aggregateId,
        aggregateType,
      },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return lastEvent?.version || 0;
  }

  countEvents(
    aggregateId: string,
    aggregateType: AggregateType,
  ): Promise<number> {
    return this.prisma.domainEvent.count({
      where: {
        aggregateId,
        aggregateType,
      },
    });
  }

  async aggregateExists(
    aggregateId: string,
    aggregateType: AggregateType,
  ): Promise<boolean> {
    const count = await this.countEvents(aggregateId, aggregateType);
    return count > 0;
  }
}
