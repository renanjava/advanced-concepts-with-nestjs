/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { QUEUES } from '../rabbitmq/rabbitmq.constants';

@Injectable()
export class WorkerService implements OnModuleInit {
  private readonly logger = new Logger(WorkerService.name);

  constructor(private readonly rabbitMQService: RabbitMQService) {}

  async onModuleInit() {
    await this.startConsuming();
  }

  private async startConsuming() {
    const channel = this.rabbitMQService.getChannel();

    await channel.addSetup(async (ch: any) => {
      await ch.consume(
        QUEUES.NOTIFICATIONS,
        async (msg: any) => {
          if (msg) {
            const content = JSON.parse(msg.content.toString());
            await this.processNotification(content, msg, ch);
          }
        },
        { noAck: false },
      );
    });

    this.logger.log('Worker listening for notifications...');
  }

  private async processNotification(message: any, msg: any, channel: any) {
    const { correlationId, data } = message;
    const retryCount = msg.properties.headers?.['x-retry-count'] || 0;

    try {
      this.logger.log(
        `[${correlationId}] Processing notification (attempt ${retryCount + 1})`,
      );

      await this.sendEmail(data.email, data.message);

      this.logger.log(`[${correlationId}] Notification sent successfully`);

      channel.ack(msg);
    } catch (error) {
      this.logger.error(
        `[${correlationId}] Error processing notification (attempt ${retryCount + 1})`,
        error.message,
      );

      if (retryCount < 3) {
        await this.retryMessage(message, retryCount, channel, msg);
      } else {
        this.logger.error(
          `[${correlationId}] Max retries reached, sending to DLQ`,
        );
        channel.nack(msg, false, false);
      }
    }
  }

  private async retryMessage(
    message: any,
    retryCount: number,
    channel: any,
    originalMsg: any,
  ) {
    const delay = this.calculateBackoff(retryCount);

    this.logger.log(`[${message.correlationId}] Retrying in ${delay}ms...`);

    channel.ack(originalMsg);

    await new Promise((resolve) => setTimeout(resolve, delay));

    await channel.sendToQueue(QUEUES.NOTIFICATIONS, message, {
      persistent: true,
      headers: {
        'x-retry-count': retryCount + 1,
      },
    });
  }

  private calculateBackoff(retryCount: number): number {
    return Math.pow(2, retryCount) * 1000;
  }

  private async sendEmail(email: string, message: string): Promise<void> {
    if (Math.random() > 0.5) {
      throw new Error('Simulated email sending error');
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log(`Email sent to ${email}: ${message}`);
  }
}
