import { Controller, Post, Body, HttpCode, Logger, Get } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @HttpCode(202)
  async create(@Body() createNotificationDto: CreateNotificationDto) {
    this.logger.log(`Received notification for ${createNotificationDto.email}`);

    const correlationId = await this.notificationsService.sendNotification(
      createNotificationDto,
    );

    return {
      message: 'Notification queued successfully',
      correlationId,
    };
  }

  @Get('dlq')
  async getDLQ() {
    this.logger.log('Fetching DLQ messages');
    const messages = await this.notificationsService.getDLQMessages();
    return {
      total: messages.length,
      messages,
    };
  }
}
