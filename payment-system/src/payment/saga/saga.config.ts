export interface SagaStepDefinition {
  name: string;
  action: string;
  compensationAction: string | null;
}

export const PAYMENT_SAGA_STEPS: SagaStepDefinition[] = [
  {
    name: 'RESERVE_FUNDS',
    action: 'reserveFunds',
    compensationAction: 'releaseFunds',
  },
  {
    name: 'PROCESS_PAYMENT',
    action: 'processPayment',
    compensationAction: 'cancelPayment',
  },
  {
    name: 'CONFIRM_PAYMENT',
    action: 'confirmPayment',
    compensationAction: null,
  },
];
