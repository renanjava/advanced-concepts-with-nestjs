/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);
  private readonly SNAPSHOT_INTERVAL = 50;

  constructor(private prisma: PrismaService) {}

  async createSnapshot(
    aggregateId: string,
    version: number,
    state: any,
  ): Promise<void> {
    await this.prisma.eventSnapshot.upsert({
      where: { aggregateId },
      create: {
        aggregateId,
        version,
        state,
      },
      update: {
        version,
        state,
      },
    });

    this.logger.log(
      `Snapshot created for ${aggregateId} at version ${version}`,
    );
  }

  getLatestSnapshot(aggregateId: string) {
    return this.prisma.eventSnapshot.findUnique({
      where: { aggregateId },
    });
  }

  shouldCreateSnapshot(eventCount: number): boolean {
    return eventCount % this.SNAPSHOT_INTERVAL === 0;
  }

  async cleanupOldSnapshots(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.prisma.eventSnapshot.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    this.logger.log(`Deleted ${result.count} old snapshots`);
    return result.count;
  }
}
