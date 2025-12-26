import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SagaExecution, SagaStatus } from '@prisma/client';
import { PAYMENT_SAGA_STEPS } from './saga.config';

@Injectable()
export class SagaExecutionRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create(paymentId: string): Promise<SagaExecution> {
    return await this.prismaService.sagaExecution.create({
      data: {
        paymentId,
        currentStep: PAYMENT_SAGA_STEPS[0].name,
        status: SagaStatus.INITIATED,
      },
    });
  }

  async update(
    id: string,
    data: {
      status?: SagaStatus;
      completedAt?: Date;
      currentStep?: string;
    },
  ): Promise<SagaExecution> {
    return await this.prismaService.sagaExecution.update({
      where: { id },
      data: {
        status: data.status,
        completedAt: data.completedAt,
        currentStep: data.currentStep,
      },
    });
  }

  async findBy(paymentId: string) {
    return await this.prismaService.sagaExecution.findUnique({
      where: { paymentId },
      include: {
        steps: {
          orderBy: { startedAt: 'asc' },
        },
      },
    });
  }
}
