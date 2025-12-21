import { Module } from '@nestjs/common';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WorkerModule } from './worker/worker.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [RabbitMQModule, NotificationsModule, WorkerModule, MetricsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
