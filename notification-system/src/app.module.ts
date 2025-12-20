import { Module } from '@nestjs/common';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [RabbitMQModule, NotificationsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
