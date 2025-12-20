import { Injectable } from '@nestjs/common';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class NotificationsService {
  constructor(private readonly rabbitMQService: RabbitMQService) {}

  async sendNotification(dto: CreateNotificationDto): Promise<string> {
    const correlationId = randomUUID();

    const message = {
      correlationId,
      timestamp: new Date().toISOString(),
      data: dto,
    };

    await this.rabbitMQService.publish('notification', message);

    return correlationId;
  }
}
