import { Injectable, Logger } from '@nestjs/common';
import {
  GatewayTransactionRequest,
  GatewayTransactionResponse,
  GatewayRefundRequest,
  GatewayRefundResponse,
  GatewayStatus,
} from './types/gateway.types';

@Injectable()
export class PaymentGatewaySimulatorService {
  private readonly logger = new Logger(PaymentGatewaySimulatorService.name);

  private isHealthy = true;
  private consecutiveFailures = 0;
  private latencyMs = 100;

  async processTransaction(
    request: GatewayTransactionRequest,
  ): Promise<GatewayTransactionResponse> {
    this.logger.log(
      `Processing transaction for customer ${request.customer.id}`,
    );

    const scenario = this.selectScenario();

    switch (scenario) {
      case 'SUCCESS':
        return this.simulateSuccess(request);

      case 'TIMEOUT':
        return this.simulateTimeout(request);

      case 'DECLINED':
        return this.simulateDeclined(request);

      case 'NETWORK_ERROR':
        return this.simulateNetworkError(request);

      case 'SLOW_RESPONSE':
        return this.simulateSlowResponse(request);

      default:
        return this.simulateSuccess(request);
    }
  }

  async refundTransaction(
    request: GatewayRefundRequest,
  ): Promise<GatewayRefundResponse> {
    this.logger.log(`Refunding transaction ${request.transactionId}`);

    await this.delay(this.latencyMs);

    if (Math.random() < 0.1) {
      throw new Error('Refund failed: Gateway temporarily unavailable');
    }

    return {
      refundId: `refund-${Date.now()}`,
      transactionId: request.transactionId,
      amount: request.amount || 0,
      status: 'success',
      processedAt: new Date(),
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    await this.delay(50);
    return {
      healthy: this.isHealthy,
      latencyMs: this.latencyMs,
    };
  }

  private selectScenario(): string {
    if (!this.isHealthy) {
      return Math.random() < 0.8 ? 'NETWORK_ERROR' : 'SUCCESS';
    }

    const rand = Math.random();

    if (rand < 0.7) return 'SUCCESS';
    if (rand < 0.75) return 'TIMEOUT';
    if (rand < 0.85) return 'DECLINED';
    if (rand < 0.9) return 'NETWORK_ERROR';
    return 'SLOW_RESPONSE';
  }

  private async simulateSuccess(
    request: GatewayTransactionRequest,
  ): Promise<GatewayTransactionResponse> {
    await this.delay(this.latencyMs);

    this.consecutiveFailures = 0;

    return {
      transactionId: `txn-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      status: GatewayStatus.APPROVED,
      amount: request.amount,
      currency: request.currency,
      processedAt: new Date(),
      authorizationCode: `AUTH-${Math.floor(Math.random() * 1000000)}`,
    };
  }

  private async simulateTimeout(
    request: GatewayTransactionRequest,
  ): Promise<GatewayTransactionResponse> {
    this.logger.warn('Simulating timeout scenario');
    this.consecutiveFailures++;

    await this.delay(30000);

    throw new Error('Request timeout');
  }

  private async simulateDeclined(
    request: GatewayTransactionRequest,
  ): Promise<GatewayTransactionResponse> {
    await this.delay(this.latencyMs);

    this.logger.warn('Transaction declined by gateway');

    return {
      transactionId: `txn-declined-${Date.now()}`,
      status: GatewayStatus.DECLINED,
      amount: request.amount,
      currency: request.currency,
      processedAt: new Date(),
      errorCode: 'INSUFFICIENT_FUNDS',
      errorMessage: 'Card declined: Insufficient funds',
    };
  }

  private async simulateNetworkError(
    request: GatewayTransactionRequest,
  ): Promise<GatewayTransactionResponse> {
    this.logger.error('Simulating network error');
    this.consecutiveFailures++;

    await this.delay(this.latencyMs);

    throw new Error('Network error: Connection refused');
  }

  private async simulateSlowResponse(
    request: GatewayTransactionRequest,
  ): Promise<GatewayTransactionResponse> {
    this.logger.warn('Simulating slow response (5s)');

    await this.delay(5000);

    return this.simulateSuccess(request);
  }

  makeUnhealthy(): void {
    this.isHealthy = false;
    this.logger.warn('Gateway marked as UNHEALTHY');
  }

  makeHealthy(): void {
    this.isHealthy = true;
    this.consecutiveFailures = 0;
    this.logger.log('Gateway marked as HEALTHY');
  }

  increaseLatency(ms: number): void {
    this.latencyMs = ms;
    this.logger.log(`Gateway latency increased to ${ms}ms`);
  }

  resetLatency(): void {
    this.latencyMs = 100;
    this.logger.log('Gateway latency reset to 100ms');
  }

  getStats() {
    return {
      healthy: this.isHealthy,
      consecutiveFailures: this.consecutiveFailures,
      latencyMs: this.latencyMs,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
