import { Controller, Get, Post, Body, Patch } from '@nestjs/common';
import { PaymentGatewayService } from './payment-gateway.service';
import { GatewayTransactionRequest } from './types/gateway.types';

@Controller('gateway')
export class GatewayController {
  constructor(private gatewayService: PaymentGatewayService) {}

  @Post('process')
  processPayment(@Body() request: GatewayTransactionRequest) {
    return this.gatewayService.processPayment(request);
  }

  @Get('health')
  healthCheck() {
    return this.gatewayService.healthCheck();
  }

  @Get('circuit/metrics')
  getCircuitMetrics() {
    return this.gatewayService.getCircuitMetrics();
  }

  @Get('gateway/stats')
  getGatewayStats() {
    return this.gatewayService.getGatewayStats();
  }

  @Patch('simulate/unhealthy')
  makeUnhealthy() {
    this.gatewayService.makeGatewayUnhealthy();
    return { message: 'Gateway marked as unhealthy' };
  }

  @Patch('simulate/healthy')
  makeHealthy() {
    this.gatewayService.makeGatewayHealthy();
    return { message: 'Gateway marked as healthy' };
  }

  @Patch('simulate/latency')
  increaseLatency(@Body('ms') ms: number) {
    this.gatewayService.increaseGatewayLatency(ms);
    return { message: `Latency increased to ${ms}ms` };
  }

  @Patch('simulate/reset-latency')
  resetLatency() {
    this.gatewayService.resetGatewayLatency();
    return { message: 'Latency reset to 100ms' };
  }

  @Post('circuit/reset')
  resetCircuit() {
    this.gatewayService.resetCircuitBreaker();
    return { message: 'Circuit breaker reset' };
  }
}
