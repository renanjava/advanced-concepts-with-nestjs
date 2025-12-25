/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountService } from '../../account/account.service';
import { SagaStatus, StepStatus, PaymentStatus } from '@prisma/client';
import { PAYMENT_SAGA_STEPS } from './saga.config';

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
    private prisma: PrismaService,
    private accountService: AccountService,
  ) {}

  async startPaymentSaga(context: SagaContext): Promise<void> {
    this.logger.log(`Starting saga for payment ${context.paymentId}`);

    const saga = await this.prisma.sagaExecution.create({
      data: {
        paymentId: context.paymentId,
        currentStep: PAYMENT_SAGA_STEPS[0].name,
        status: SagaStatus.INITIATED,
      },
    });

    try {
      await this.executeSteps(saga.id, context);

      await this.prisma.sagaExecution.update({
        where: { id: saga.id },
        data: {
          status: SagaStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      await this.prisma.payment.update({
        where: { id: context.paymentId },
        data: { status: PaymentStatus.COMPLETED },
      });

      this.logger.log(
        `Saga completed successfully for payment ${context.paymentId}`,
      );
    } catch (error) {
      this.logger.error(`Saga failed for payment ${context.paymentId}:`, error);

      await this.compensate(saga.id, context);
    }
  }

  private async executeSteps(
    sagaId: string,
    context: SagaContext,
  ): Promise<void> {
    await this.prisma.sagaExecution.update({
      where: { id: sagaId },
      data: { status: SagaStatus.IN_PROGRESS },
    });

    for (const stepDef of PAYMENT_SAGA_STEPS) {
      this.logger.log(`Executing step: ${stepDef.name}`);

      const step = await this.prisma.sagaStep.create({
        data: {
          sagaId,
          stepName: stepDef.name,
          status: StepStatus.PENDING,
        },
      });

      try {
        await this.prisma.sagaStep.update({
          where: { id: step.id },
          data: { status: StepStatus.IN_PROGRESS },
        });

        await this.executeStepAction(stepDef.action, context);

        await this.prisma.sagaStep.update({
          where: { id: step.id },
          data: {
            status: StepStatus.COMPLETED,
            completedAt: new Date(),
          },
        });

        await this.prisma.sagaExecution.update({
          where: { id: sagaId },
          data: { currentStep: stepDef.name },
        });

        this.logger.log(`Step ${stepDef.name} completed`);
      } catch (error) {
        this.logger.error(`Step ${stepDef.name} failed:`, error);

        await this.prisma.sagaStep.update({
          where: { id: step.id },
          data: {
            status: StepStatus.FAILED,
            error: error.message,
            completedAt: new Date(),
          },
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

    await this.prisma.payment.update({
      where: { id: context.paymentId },
      data: { status: PaymentStatus.FUNDS_RESERVED },
    });

    this.logger.log(`Funds reserved: ${reservation.id}`);
  }

  private async processPayment(context: SagaContext): Promise<void> {
    this.logger.log(`Processing payment ${context.paymentId}`);

    await this.prisma.payment.update({
      where: { id: context.paymentId },
      data: { status: PaymentStatus.PROCESSING },
    });

    await this.simulatePaymentGateway(context);

    this.logger.log(`Payment processed: ${context.paymentId}`);
  }

  private async confirmPayment(context: SagaContext): Promise<void> {
    this.logger.log(`Confirming payment ${context.paymentId}`);

    await this.accountService.confirmReservation(context.paymentId);

    this.logger.log(`Payment confirmed: ${context.paymentId}`);
  }

  private async compensate(
    sagaId: string,
    context: SagaContext,
  ): Promise<void> {
    this.logger.warn(`Starting compensation for saga ${sagaId}`);

    await this.prisma.sagaExecution.update({
      where: { id: sagaId },
      data: { status: SagaStatus.COMPENSATING },
    });

    await this.prisma.payment.update({
      where: { id: context.paymentId },
      data: { status: PaymentStatus.COMPENSATING },
    });

    const completedSteps = await this.prisma.sagaStep.findMany({
      where: {
        sagaId,
        status: StepStatus.COMPLETED,
      },
      orderBy: { startedAt: 'desc' },
    });

    for (const step of completedSteps) {
      const stepDef = PAYMENT_SAGA_STEPS.find((s) => s.name === step.stepName);

      if (stepDef?.compensationAction) {
        this.logger.log(`Compensating step: ${step.stepName}`);

        try {
          await this.executeCompensation(stepDef.compensationAction, context);

          await this.prisma.sagaStep.update({
            where: { id: step.id },
            data: { status: StepStatus.COMPENSATED },
          });

          this.logger.log(`Step ${step.stepName} compensated`);
        } catch (error) {
          this.logger.error(`Failed to compensate ${step.stepName}:`, error);
        }
      }
    }

    await this.prisma.sagaExecution.update({
      where: { id: sagaId },
      data: {
        status: SagaStatus.COMPENSATED,
        completedAt: new Date(),
      },
    });

    await this.prisma.payment.update({
      where: { id: context.paymentId },
      data: { status: PaymentStatus.COMPENSATED },
    });

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
      /*case 'cancelPayment':
        await this.cancelPayment(context);
        break;*/
      default:
        this.logger.warn(`Unknown compensation action: ${action}`);
    }
  }

  private async releaseFunds(context: SagaContext): Promise<void> {
    this.logger.log(`Releasing funds for payment ${context.paymentId}`);
    await this.accountService.releaseReservation(context.paymentId);
  }

  /*private cancelPayment(context: SagaContext): Promise<void> {
    this.logger.log(`Canceling payment ${context.paymentId}`);
    // await this.paymentGateway.cancel(context.gatewayTransactionId);
  }*/

  private async simulatePaymentGateway(context: SagaContext): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (Math.random() < 0.2) {
      throw new Error('Payment gateway timeout');
    }

    context.gatewayTransactionId = `gw-${Date.now()}`;
  }

  findSagaByPaymentId(paymentId: string) {
    return this.prisma.sagaExecution.findUnique({
      where: { paymentId },
      include: {
        steps: {
          orderBy: { startedAt: 'asc' },
        },
      },
    });
  }
}
