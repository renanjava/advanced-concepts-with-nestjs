/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-async-promise-executor */
/* eslint-disable @typescript-eslint/no-misused-promises */
import { Injectable } from '@nestjs/common';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { QUEUES } from '../rabbitmq/rabbitmq.constants';
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

  async getDLQMessages(): Promise<any[]> {
    const channel = this.rabbitMQService.getChannel();
    const messages: any[] = [];

    return new Promise(async (resolve) => {
      await channel.addSetup(async (ch: any) => {
        const qInfo = await ch.checkQueue(QUEUES.NOTIFICATIONS_DLQ);
        const count: number = qInfo?.messageCount ?? 0;

        for (let i = 0; i < count; i++) {
          const msg = await ch.get(QUEUES.NOTIFICATIONS_DLQ, { noAck: false });
          if (!msg) break;

          const parsed = JSON.parse(msg.content.toString());
          messages.push({
            correlationId: parsed.correlationId,
            content: parsed,
            retryCount: msg.properties.headers?.['x-retry-count'] || 0,
          });

          ch.nack(msg, false, true);
        }

        resolve(messages);
      });
    });
  }
}
