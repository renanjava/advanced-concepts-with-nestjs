/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import { EventStoreService } from './events/event-store.service';
import { EventProjectionService } from './events/event-projection.service';
import { SnapshotService } from './snapshot.service';
import {
  DomainEventData,
  AggregateType,
  EventType,
} from './events/domain-events';

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(
    private eventStore: EventStoreService,
    private projection: EventProjectionService,
    private snapshot: SnapshotService,
  ) {}

  async recordEvent(eventData: DomainEventData): Promise<void> {
    const event = await this.eventStore.saveEvent(eventData);

    await this.projection.projectEvent(event);

    const eventCount = await this.eventStore.countEvents(
      eventData.aggregateId,
      eventData.aggregateType,
    );

    if (this.snapshot.shouldCreateSnapshot(eventCount)) {
      const state = await this.getAggregateState(
        eventData.aggregateId,
        eventData.aggregateType,
      );

      if (state) {
        await this.snapshot.createSnapshot(
          eventData.aggregateId,
          event.version,
          state,
        );
      }
    }
  }

  async recordEvents(events: DomainEventData[]): Promise<void> {
    const savedEvents = await this.eventStore.saveEvents(events);

    for (const event of savedEvents) {
      await this.projection.projectEvent(event);
    }
  }

  async reconstructAggregate(
    aggregateId: string,
    aggregateType: AggregateType,
  ): Promise<any> {
    const snapshot = await this.snapshot.getLatestSnapshot(aggregateId);

    let state = snapshot?.state || null;
    const fromVersion = snapshot?.version || 0;

    const events = await this.eventStore.getEventsAfterVersion(
      aggregateId,
      aggregateType,
      fromVersion,
    );

    if (!state) {
      state = this.createInitialState(aggregateType);
    }

    for (const event of events) {
      state = this.applyEvent(state, event);
    }

    return state;
  }

  async getAggregateHistory(aggregateId: string, aggregateType: AggregateType) {
    const events = await this.eventStore.getEventsByAggregate(
      aggregateId,
      aggregateType,
    );

    return {
      aggregateId,
      aggregateType,
      eventCount: events.length,
      events: events.map((e) => ({
        version: e.version,
        eventType: e.eventType,
        timestamp: e.timestamp,
        data: e.eventData,
      })),
    };
  }

  getPaymentProjection(paymentId: string) {
    return this.projection.getPaymentProjection(paymentId);
  }

  getAccountProjection(userId: string) {
    return this.projection.getAccountProjection(userId);
  }
  listUserPayments(userId: string) {
    return this.projection.listPaymentsByUser(userId);
  }

  async getEventsByType(eventType: EventType, limit: number = 100) {
    return this.eventStore.getEventsByType(eventType, limit);
  }

  async getEventsByDateRange(startDate: Date, endDate: Date) {
    return this.eventStore.getEventsByDateRange(startDate, endDate);
  }
  async rebuildProjections() {
    return this.projection.rebuildProjections();
  }

  private async getAggregateState(
    aggregateId: string,
    aggregateType: AggregateType,
  ): Promise<any> {
    switch (aggregateType) {
      case AggregateType.PAYMENT:
        return this.projection.getPaymentProjection(aggregateId);

      case AggregateType.ACCOUNT:
        const account = await this.projection.getAccountProjection(aggregateId);
        return account;

      default:
        return null;
    }
  }

  private createInitialState(aggregateType: AggregateType): any {
    switch (aggregateType) {
      case AggregateType.PAYMENT:
        return {
          status: 'PENDING',
          events: [],
        };

      case AggregateType.ACCOUNT:
        return {
          balance: 0,
          reservedBalance: 0,
        };

      default:
        return {};
    }
  }

  private applyEvent(state: any, event: any): any {
    const newState = { ...state };

    switch (event.eventType) {
      case EventType.PAYMENT_INITIATED:
        newState.status = 'PENDING';
        newState.amount = event.eventData.amount;
        break;

      case EventType.FUNDS_RESERVED:
        newState.status = 'FUNDS_RESERVED';
        newState.reservationId = event.eventData.reservationId;
        break;

      case EventType.PAYMENT_PROCESSING:
        newState.status = 'PROCESSING';
        newState.gatewayTxId = event.eventData.gatewayTransactionId;
        break;

      case EventType.PAYMENT_COMPLETED:
        newState.status = 'COMPLETED';
        newState.completedAt = event.timestamp;
        break;

      case EventType.PAYMENT_FAILED:
        newState.status = 'FAILED';
        newState.error = event.eventData.reason;
        break;

      case EventType.ACCOUNT_CREATED:
        newState.balance = event.eventData.initialBalance;
        break;

      case EventType.FUNDS_DEBITED:
        newState.balance -= event.eventData.amount;
        break;

      case EventType.FUNDS_CREDITED:
        newState.balance += event.eventData.amount;
        break;
    }

    return newState;
  }
}
