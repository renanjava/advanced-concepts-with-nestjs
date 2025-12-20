import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module';

@Module({
  imports: [RabbitMQModule],
  providers: [WorkerService],
})
export class WorkerModule {}
