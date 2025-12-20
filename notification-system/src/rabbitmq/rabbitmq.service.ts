/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as amqp from 'amqp-connection-manager';
import { ChannelWrapper } from 'amqp-connection-manager';
import { RABBITMQ_CONFIG, QUEUES, EXCHANGES } from './rabbitmq.constants';

@Injectable()
export class RabbitMQService implements OnModuleInit {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqp.AmqpConnectionManager;
  private channelWrapper: ChannelWrapper;

  onModuleInit() {
    this.connect();
  }

  private connect() {
    this.connection = amqp.connect([RABBITMQ_CONFIG.url]);

    this.connection.on('connect', () => {
      this.logger.log('Connected to RabbitMQ');
    });

    this.connection.on('disconnect', (err) => {
      this.logger.error('Disconnected from RabbitMQ', err);
    });

    this.channelWrapper = this.connection.createChannel({
      json: true,
      setup: async (channel: any) => {
        await channel.assertExchange(EXCHANGES.NOTIFICATIONS, 'direct', {
          durable: true,
        });

        await channel.assertQueue(QUEUES.NOTIFICATIONS, {
          durable: true,
        });

        await channel.bindQueue(
          QUEUES.NOTIFICATIONS,
          EXCHANGES.NOTIFICATIONS,
          'notification',
        );

        this.logger.log('Queues and exchanges configured');
      },
    });
  }

  async publish(routingKey: string, message: any) {
    try {
      await this.channelWrapper.publish(
        EXCHANGES.NOTIFICATIONS,
        routingKey,
        message,
        {
          persistent: true,
        },
      );
      this.logger.log(
        `Message published to exchange: ${EXCHANGES.NOTIFICATIONS}`,
      );
    } catch (error) {
      this.logger.error('Error publishing message', error);
      throw error;
    }
  }

  getChannel(): ChannelWrapper {
    return this.channelWrapper;
  }
}
