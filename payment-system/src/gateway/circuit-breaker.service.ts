import { Injectable, Logger } from '@nestjs/common';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  halfOpenMaxCalls: number;
  requestTimeout: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: Date | null;
  lastStateChange: Date;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rejectedRequests: number;
  halfOpenRequests: number;
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string = 'Circuit breaker is OPEN') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: Date | null = null;
  private lastStateChange: Date = new Date();
  private halfOpenRequests = 0;

  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private rejectedRequests = 0;

  private readonly config: CircuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
    halfOpenMaxCalls: 3,
    requestTimeout: 10000,
  };

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        this.rejectedRequests++;
        this.logger.warn('Request rejected: Circuit is OPEN');
        throw new CircuitBreakerOpenError(
          `Service unavailable. Circuit will retry in ${this.getRemainingTimeout()}ms`,
        );
      }
    }

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenRequests >= this.config.halfOpenMaxCalls) {
        this.rejectedRequests++;
        throw new CircuitBreakerOpenError(
          'Circuit is HALF_OPEN: Max concurrent requests reached',
        );
      }
      this.halfOpenRequests++;
    }

    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    } finally {
      if (this.state === CircuitState.HALF_OPEN) {
        this.halfOpenRequests--;
      }
    }
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error('Request timeout')),
          this.config.requestTimeout,
        ),
      ),
    ]);
  }

  private onSuccess(): void {
    this.successfulRequests++;
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      this.logger.log(
        `HALF_OPEN success ${this.successCount}/${this.config.successThreshold}`,
      );

      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.successCount = 0;
      }
    }
  }

  private onFailure(error: Error): void {
    this.failedRequests++;
    this.failureCount++;
    this.lastFailureTime = new Date();

    this.logger.error(
      `Request failed (${this.failureCount}/${this.config.failureThreshold}): ${error.message}`,
    );

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
      this.successCount = 0;
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = new Date();

    this.logger.warn(`Circuit breaker: ${oldState} -> ${newState}`);

    if (newState === CircuitState.OPEN) {
      this.logger.error(
        `Circuit OPEN for ${this.config.timeout / 1000}s after ${this.failureCount} failures`,
      );
    } else if (newState === CircuitState.CLOSED) {
      this.logger.log('Circuit CLOSED: Service recovered');
      this.failureCount = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.logger.log('Circuit HALF_OPEN: Testing service health');
      this.halfOpenRequests = 0;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;

    const elapsed = Date.now() - this.lastFailureTime.getTime();
    return elapsed >= this.config.timeout;
  }

  private getRemainingTimeout(): number {
    if (!this.lastFailureTime) return 0;

    const elapsed = Date.now() - this.lastFailureTime.getTime();
    return Math.max(0, this.config.timeout - elapsed);
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      rejectedRequests: this.rejectedRequests,
      halfOpenRequests: this.halfOpenRequests,
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenRequests = 0;
    this.logger.log('Circuit breaker reset');
  }

  forceState(state: CircuitState): void {
    this.transitionTo(state);
  }
}
