export enum AggregateType {
  PAYMENT = 'Payment',
  ACCOUNT = 'Account',
  RESERVATION = 'Reservation',
}

export enum EventType {
  PAYMENT_INITIATED = 'PaymentInitiated',
  FUNDS_RESERVED = 'FundsReserved',
  PAYMENT_PROCESSING = 'PaymentProcessing',
  PAYMENT_COMPLETED = 'PaymentCompleted',
  PAYMENT_FAILED = 'PaymentFailed',
  PAYMENT_COMPENSATED = 'PaymentCompensated',

  ACCOUNT_CREATED = 'AccountCreated',
  FUNDS_DEBITED = 'FundsDebited',
  FUNDS_CREDITED = 'FundsCredited',
  RESERVATION_CREATED = 'ReservationCreated',
  RESERVATION_CONFIRMED = 'ReservationConfirmed',
  RESERVATION_RELEASED = 'ReservationReleased',
}

export interface DomainEventData {
  aggregateId: string;
  aggregateType: AggregateType;
  eventType: EventType;
  eventData: any;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface PaymentInitiatedEvent {
  paymentId: string;
  userId: string;
  amount: number;
  idempotencyKey: string;
}

export interface FundsReservedEvent {
  paymentId: string;
  userId: string;
  reservationId: string;
  amount: number;
}

export interface PaymentProcessingEvent {
  paymentId: string;
  gatewayTransactionId: string;
}

export interface PaymentCompletedEvent {
  paymentId: string;
  gatewayTransactionId: string;
  authorizationCode: string;
  completedAt: Date;
}

export interface PaymentFailedEvent {
  paymentId: string;
  reason: string;
  errorCode?: string;
}

export interface AccountCreatedEvent {
  accountId: string;
  userId: string;
  initialBalance: number;
}

export interface FundsDebitedEvent {
  accountId: string;
  amount: number;
  paymentId?: string;
  reason: string;
}

export interface FundsCreditedEvent {
  accountId: string;
  amount: number;
  reason: string;
}
