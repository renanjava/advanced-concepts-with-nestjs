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

    try {
      this.logger.log(
        `[${correlationId}] Processing notification for ${data.email}`,
      );

      await this.sendEmail(data.email, data.message);

      this.logger.log(
        `[${correlationId}] Notification sent successfully to ${data.email}`,
      );

      channel.ack(msg);
    } catch (error) {
      this.logger.error(
        `[${correlationId}] Error processing notification`,
        error,
      );

      channel.ack(msg);
    }
  }

  private async sendEmail(email: string, message: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log(`Email sent to ${email}: ${message}`);
  }
}
