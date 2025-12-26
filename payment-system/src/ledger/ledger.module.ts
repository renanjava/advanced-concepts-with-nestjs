import { Module } from '@nestjs/common';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { EventStoreService } from './event-store.service';
import { EventProjectionService } from './event-projection.service';
import { SnapshotService } from './snapshot.service';

@Module({
  controllers: [LedgerController],
  providers: [
    LedgerService,
    EventStoreService,
    EventProjectionService,
    SnapshotService,
  ],
  exports: [LedgerService],
})
export class LedgerModule {}
