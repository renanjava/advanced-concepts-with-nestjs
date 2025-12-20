export const RABBITMQ_CONFIG = {
  url: process.env.RABBITMQ_URL || 'amqp://admin:admin@localhost:5672',
};

export const QUEUES = {
  NOTIFICATIONS: 'notifications.queue',
  NOTIFICATIONS_DLQ: 'notifications.dlq',
};

export const EXCHANGES = {
  NOTIFICATIONS: 'notifications.exchange',
  NOTIFICATIONS_DLX: 'notifications.dlx',
};

export const ROUTING_KEYS = {
  NOTIFICATION: 'notification',
};
