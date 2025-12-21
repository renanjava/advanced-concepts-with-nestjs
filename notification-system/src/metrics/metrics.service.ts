import { Injectable } from '@nestjs/common';
import { Counter, Histogram, register } from 'prom-client';

@Injectable()
export class MetricsService {
  private notificationsReceived: Counter;
  private notificationsProcessed: Counter;
  private notificationsFailed: Counter;
  private processingDuration: Histogram;

  constructor() {
    this.notificationsReceived = new Counter({
      name: 'notifications_received_total',
      help: 'Total notifications received',
    });

    this.notificationsProcessed = new Counter({
      name: 'notifications_processed_total',
      help: 'Total notifications processed successfully',
    });

    this.notificationsFailed = new Counter({
      name: 'notifications_failed_total',
      help: 'Total notifications failed',
    });

    this.processingDuration = new Histogram({
      name: 'notification_processing_duration_seconds',
      help: 'Duration of notification processing',
      buckets: [0.1, 0.5, 1, 2, 5],
    });
  }

  incrementReceived() {
    this.notificationsReceived.inc();
  }

  incrementProcessed() {
    this.notificationsProcessed.inc();
  }

  incrementFailed() {
    this.notificationsFailed.inc();
  }

  recordDuration(durationSeconds: number) {
    this.processingDuration.observe(durationSeconds);
  }

  getMetrics(): Promise<string> {
    return register.metrics();
  }
}
