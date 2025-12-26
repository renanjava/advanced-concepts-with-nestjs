import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StepStatus } from '@prisma/client';

@Injectable()
export class SagaStepRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create(sagaId: string, stepName: string) {
    return await this.prismaService.sagaStep.create({
      data: {
        sagaId,
        stepName,
        status: StepStatus.PENDING,
      },
    });
  }

  async update(
    id: string,
    data: { status?: StepStatus; error?: string; completedAt?: Date },
  ) {
    return await this.prismaService.sagaStep.update({
      where: { id },
      data: {
        status: data.status,
        error: data.error,
        completedAt: data.completedAt,
      },
    });
  }

  async findAllCompletedSteps(sagaId: string) {
    return await this.prismaService.sagaStep.findMany({
      where: {
        sagaId,
        status: StepStatus.COMPLETED,
      },
      orderBy: { startedAt: 'desc' },
    });
  }
}
