export enum GatewayStatus {
  APPROVED = 'approved',
  DECLINED = 'declined',
  PROCESSING = 'processing',
  ERROR = 'error',
}

export interface GatewayTransactionRequest {
  amount: number;
  currency: string;
  paymentMethod: string;
  customer: {
    id: string;
    name?: string;
    email?: string;
  };
  metadata?: Record<string, any>;
}

export interface GatewayTransactionResponse {
  transactionId: string;
  status: GatewayStatus;
  amount: number;
  currency: string;
  processedAt: Date;
  authorizationCode?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface GatewayRefundRequest {
  transactionId: string;
  amount?: number;
  reason?: string;
}

export interface GatewayRefundResponse {
  refundId: string;
  transactionId: string;
  amount: number;
  status: 'success' | 'failed';
  processedAt: Date;
}
