/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import { PaymentGatewaySimulatorService } from './payment-gateway-simulator.service';
import {
  CircuitBreakerService,
  CircuitBreakerOpenError,
} from './circuit-breaker.service';
import {
  GatewayTransactionRequest,
  GatewayTransactionResponse,
  GatewayRefundRequest,
  GatewayRefundResponse,
} from './types/gateway.types';

@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);

  constructor(
    private gatewaySimulator: PaymentGatewaySimulatorService,
    private circuitBreaker: CircuitBreakerService,
  ) {}

  async processPayment(
    request: GatewayTransactionRequest,
  ): Promise<GatewayTransactionResponse> {
    try {
      return await this.circuitBreaker.execute(() =>
        this.gatewaySimulator.processTransaction(request),
      );
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        this.logger.warn('Payment rejected by circuit breaker');
        return this.fallbackStrategy(request, error);
      }
      throw error;
    }
  }

  async refundPayment(
    request: GatewayRefundRequest,
  ): Promise<GatewayRefundResponse> {
    return this.circuitBreaker.execute(() =>
      this.gatewaySimulator.refundTransaction(request),
    );
  }

  async healthCheck() {
    return this.gatewaySimulator.healthCheck();
  }

  getCircuitMetrics() {
    return this.circuitBreaker.getMetrics();
  }

  getGatewayStats() {
    return this.gatewaySimulator.getStats();
  }

  private fallbackStrategy(
    request: GatewayTransactionRequest,
    error: CircuitBreakerOpenError,
  ): GatewayTransactionResponse {
    this.logger.warn('Using fallback strategy: Queue for retry');

    return {
      transactionId: `pending-${Date.now()}`,
      status: 'processing' as any,
      amount: request.amount,
      currency: request.currency,
      processedAt: new Date(),
      errorMessage:
        'Payment queued for processing. Gateway temporarily unavailable.',
    };
  }

  makeGatewayUnhealthy(): void {
    this.gatewaySimulator.makeUnhealthy();
  }

  makeGatewayHealthy(): void {
    this.gatewaySimulator.makeHealthy();
  }

  increaseGatewayLatency(ms: number): void {
    this.gatewaySimulator.increaseLatency(ms);
  }

  resetGatewayLatency(): void {
    this.gatewaySimulator.resetLatency();
  }

  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }
}
