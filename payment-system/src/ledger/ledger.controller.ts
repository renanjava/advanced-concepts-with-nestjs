/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { AggregateType, EventType } from './events/domain-events';

@Controller('ledger')
export class LedgerController {
  constructor(private ledgerService: LedgerService) {}

  @Get('payment/:paymentId/history')
  getPaymentHistory(@Param('paymentId') paymentId: string) {
    return this.ledgerService.getAggregateHistory(
      paymentId,
      AggregateType.PAYMENT,
    );
  }

  @Get('payment/:paymentId/projection')
  getPaymentProjection(@Param('paymentId') paymentId: string) {
    return this.ledgerService.getPaymentProjection(paymentId);
  }

  @Get('payment/:paymentId/reconstruct')
  async reconstructPayment(@Param('paymentId') paymentId: string) {
    const state = await this.ledgerService.reconstructAggregate(
      paymentId,
      AggregateType.PAYMENT,
    );
    return { paymentId, reconstructedState: state };
  }

  @Get('account/:userId/projection')
  getAccountProjection(@Param('userId') userId: string) {
    return this.ledgerService.getAccountProjection(userId);
  }

  @Get('account/:userId/payments')
  listUserPayments(@Param('userId') userId: string) {
    return this.ledgerService.listUserPayments(userId);
  }

  @Get('events/type/:eventType')
  getEventsByType(
    @Param('eventType') eventType: EventType,
    @Query('limit') limit?: number,
  ) {
    return this.ledgerService.getEventsByType(eventType, limit || 100);
  }

  @Get('events/range')
  getEventsByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.ledgerService.getEventsByDateRange(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Post('projections/rebuild')
  async rebuildProjections() {
    await this.ledgerService.rebuildProjections();
    return { message: 'Projections rebuilt successfully' };
  }
}
