/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import { AccountService } from '../../account/account.service';
import { SagaStatus, StepStatus, PaymentStatus } from '@prisma/client';
import { PAYMENT_SAGA_STEPS } from './saga.config';
import { PaymentGatewayService } from '../../gateway/payment-gateway.service';
import { LedgerService } from '../../ledger/ledger.service';
import { AggregateType, EventType } from '../../ledger/events/domain-events';
import { SagaExecutionRepository } from './saga-execution.repository';
import { SagaStepRepository } from './saga-step.repository';
import { PaymentRepository } from '../payment.repository';

export interface SagaContext {
  paymentId: string;
  userId: string;
  amount: number;
  reservationId?: string;
  gatewayTransactionId?: string;
}

@Injectable()
export class SagaOrchestratorService {
  private readonly logger = new Logger(SagaOrchestratorService.name);

  constructor(
    private accountService: AccountService,
    private gatewayService: PaymentGatewayService,
    private ledgerService: LedgerService,
    private sagaExecutionRepository: SagaExecutionRepository,
    private sagaStepRepository: SagaStepRepository,
    private paymentRepository: PaymentRepository,
  ) {}

  async startPaymentSaga(context: SagaContext): Promise<void> {
    this.logger.log(`Starting saga for payment ${context.paymentId}`);

    const saga = await this.sagaExecutionRepository.create(context.paymentId);

    try {
      await this.executeSteps(saga.id, context);

      await this.sagaExecutionRepository.update(saga.id, {
        status: SagaStatus.COMPLETED,
        completedAt: new Date(),
      });

      await this.paymentRepository.update(
        context.paymentId,
        PaymentStatus.COMPLETED,
      );

      this.logger.log(
        `Saga completed successfully for payment ${context.paymentId}`,
      );
    } catch (error) {
      this.logger.error(`Saga failed for payment ${context.paymentId}:`, error);

      await this.ledgerService.recordEvent({
        aggregateId: context.paymentId,
        aggregateType: AggregateType.PAYMENT,
        eventType: EventType.PAYMENT_FAILED,
        eventData: {
          paymentId: context.paymentId,
          reason: error.message,
        },
        userId: context.userId,
      });

      await this.compensate(saga.id, context);
    }
  }

  private async executeSteps(
    sagaId: string,
    context: SagaContext,
  ): Promise<void> {
    await this.sagaExecutionRepository.update(sagaId, {
      status: SagaStatus.IN_PROGRESS,
    });

    for (const stepDef of PAYMENT_SAGA_STEPS) {
      this.logger.log(`Executing step: ${stepDef.name}`);

      const step = await this.sagaStepRepository.create(sagaId, stepDef.name);

      try {
        await this.sagaStepRepository.update(step.id, {
          status: StepStatus.IN_PROGRESS,
        });

        await this.executeStepAction(stepDef.action, context);

        await this.sagaStepRepository.update(step.id, {
          status: StepStatus.COMPLETED,
          completedAt: new Date(),
        });

        await this.sagaExecutionRepository.update(sagaId, {
          currentStep: stepDef.name,
        });

        this.logger.log(`Step ${stepDef.name} completed`);
      } catch (error) {
        this.logger.error(`Step ${stepDef.name} failed:`, error);

        await this.sagaStepRepository.update(step.id, {
          status: StepStatus.FAILED,
          error: error.message,
          completedAt: new Date(),
        });

        throw error;
      }
    }
  }

  private async executeStepAction(
    action: string,
    context: SagaContext,
  ): Promise<void> {
    switch (action) {
      case 'reserveFunds':
        await this.reserveFunds(context);
        break;
      case 'processPayment':
        await this.processPayment(context);
        break;
      case 'confirmPayment':
        await this.confirmPayment(context);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private async reserveFunds(context: SagaContext): Promise<void> {
    this.logger.log(`Reserving funds for payment ${context.paymentId}`);

    const reservation = await this.accountService.reserveFunds({
      userId: context.userId,
      paymentId: context.paymentId,
      amount: context.amount,
    });

    context.reservationId = reservation.id;

    await this.paymentRepository.update(
      context.paymentId,
      PaymentStatus.FUNDS_RESERVED,
    );

    await this.ledgerService.recordEvent({
      aggregateId: context.paymentId,
      aggregateType: AggregateType.PAYMENT,
      eventType: EventType.FUNDS_RESERVED,
      eventData: {
        paymentId: context.paymentId,
        userId: context.userId,
        reservationId: reservation.id,
        amount: context.amount,
      },
      userId: context.userId,
    });

    this.logger.log(`Funds reserved: ${reservation.id}`);
  }

  private async processPayment(context: SagaContext): Promise<void> {
    this.logger.log(`Processing payment ${context.paymentId} via gateway`);

    await this.paymentRepository.update(
      context.paymentId,
      PaymentStatus.PROCESSING,
    );

    await this.ledgerService.recordEvent({
      aggregateId: context.paymentId,
      aggregateType: AggregateType.PAYMENT,
      eventType: EventType.PAYMENT_PROCESSING,
      eventData: {
        paymentId: context.paymentId,
      },
      userId: context.userId,
    });

    const gatewayResponse = await this.gatewayService.processPayment({
      amount: context.amount,
      currency: 'BRL',
      paymentMethod: 'credit_card',
      customer: {
        id: context.userId,
      },
      metadata: {
        paymentId: context.paymentId,
      },
    });

    context.gatewayTransactionId = gatewayResponse.transactionId;

    if (gatewayResponse.status !== 'approved') {
      throw new Error(
        `Payment declined: ${gatewayResponse.errorMessage || 'Unknown error'}`,
      );
    }

    this.logger.log(
      `Payment processed successfully: ${gatewayResponse.transactionId}`,
    );
  }

  private async confirmPayment(context: SagaContext): Promise<void> {
    this.logger.log(`Confirming payment ${context.paymentId}`);

    await this.accountService.confirmReservation(context.paymentId);

    await this.ledgerService.recordEvent({
      aggregateId: context.paymentId,
      aggregateType: AggregateType.PAYMENT,
      eventType: EventType.PAYMENT_COMPLETED,
      eventData: {
        paymentId: context.paymentId,
        gatewayTransactionId: context.gatewayTransactionId,
        completedAt: new Date(),
      },
      userId: context.userId,
    });

    this.logger.log(`Payment confirmed: ${context.paymentId}`);
  }

  private async compensate(
    sagaId: string,
    context: SagaContext,
  ): Promise<void> {
    this.logger.warn(`Starting compensation for saga ${sagaId}`);

    await this.ledgerService.recordEvent({
      aggregateId: context.paymentId,
      aggregateType: AggregateType.PAYMENT,
      eventType: EventType.PAYMENT_COMPENSATED,
      eventData: {
        paymentId: context.paymentId,
      },
      userId: context.userId,
    });

    await this.sagaExecutionRepository.update(sagaId, {
      status: SagaStatus.COMPENSATING,
    });

    await this.paymentRepository.update(
      context.paymentId,
      PaymentStatus.COMPENSATING,
    );

    const completedSteps =
      await this.sagaStepRepository.findAllCompletedSteps(sagaId);

    for (const step of completedSteps) {
      const stepDef = PAYMENT_SAGA_STEPS.find((s) => s.name === step.stepName);

      if (stepDef?.compensationAction) {
        this.logger.log(`Compensating step: ${step.stepName}`);

        try {
          await this.executeCompensation(stepDef.compensationAction, context);

          await this.sagaStepRepository.update(step.id, {
            status: StepStatus.COMPENSATED,
          });

          this.logger.log(`Step ${step.stepName} compensated`);
        } catch (error) {
          this.logger.error(`Failed to compensate ${step.stepName}:`, error);
        }
      }
    }

    await this.sagaExecutionRepository.update(sagaId, {
      status: SagaStatus.COMPENSATED,
      completedAt: new Date(),
    });

    await this.paymentRepository.update(
      context.paymentId,
      PaymentStatus.COMPENSATING,
    );

    this.logger.warn(`Saga compensated for payment ${context.paymentId}`);
  }

  private async executeCompensation(
    action: string,
    context: SagaContext,
  ): Promise<void> {
    switch (action) {
      case 'releaseFunds':
        await this.releaseFunds(context);
        break;
      case 'cancelPayment':
        await this.cancelPayment(context);
        break;
      default:
        this.logger.warn(`Unknown compensation action: ${action}`);
    }
  }

  private async releaseFunds(context: SagaContext): Promise<void> {
    this.logger.log(`Releasing funds for payment ${context.paymentId}`);
    await this.accountService.releaseReservation(context.paymentId);
  }

  private async cancelPayment(context: SagaContext): Promise<void> {
    if (!context.gatewayTransactionId) {
      this.logger.warn('No gateway transaction to cancel');
      return;
    }

    this.logger.log(`Canceling payment ${context.gatewayTransactionId}`);

    try {
      await this.gatewayService.refundPayment({
        transactionId: context.gatewayTransactionId,
        reason: 'Saga compensation',
      });
      this.logger.log('Payment canceled successfully');
    } catch (error) {
      this.logger.error('Failed to cancel payment:', error);
    }
  }

  findSagaByPaymentId(paymentId: string) {
    return this.sagaExecutionRepository.findBy(paymentId);
  }
}
