/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { PrismaService } from './../prisma/prisma.service';
import { PaymentService } from './payment.service';
import { IdempotencyService } from './idempotency.service';
import { Test, TestingModule } from '@nestjs/testing';
import { Payment, PaymentStatus, Prisma } from '@prisma/client';
import { CreatePaymentDto } from './dto/create-payment.dto';

type MockPrismaPayment = {
  create: jest.Mock;
  update: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
};

type MockPrismaService = {
  payment: MockPrismaPayment;
};

type MockIdempotencyService = {
  checkOrCreate: jest.Mock;
  markCompleted: jest.Mock;
  markFailed: jest.Mock;
};

describe('PaymentService - Tests', () => {
  let service: PaymentService;
  let prismaService: MockPrismaService;
  let idempotencyService: MockIdempotencyService;

  const mockPaymentId = 'payment-id-123';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440000';
  const mockIdempotencyKey = 'idempotency-key-001';
  const mockAmount = 100.5;

  const mockPendingPayment: Payment = {
    id: mockPaymentId,
    userId: mockUserId,
    amount: new Prisma.Decimal(mockAmount),
    status: PaymentStatus.PENDING,
    idempotencyKey: mockIdempotencyKey,
    createdAt: new Date(),
    updatedAt: new Date(),
    errorMessage: null,
  };

  const mockCompletedPayment: Payment = {
    ...mockPendingPayment,
    status: PaymentStatus.COMPLETED,
  };

  const mockCreatePaymentDto: CreatePaymentDto = {
    userId: mockUserId,
    amount: mockAmount,
    idempotencyKey: mockIdempotencyKey,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: PrismaService,
          useValue: {
            payment: {
              create: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: IdempotencyService,
          useValue: {
            checkOrCreate: jest.fn(),
            markCompleted: jest.fn(),
            markFailed: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    prismaService = module.get(PrismaService);
    idempotencyService = module.get(IdempotencyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('1. Create Payment Method', () => {
    it('should create payment', async () => {
      idempotencyService.checkOrCreate.mockResolvedValue('NEW');
      prismaService.payment.findUnique.mockResolvedValue(null);
      prismaService.payment.create.mockResolvedValue(mockPendingPayment);
      const processPaymentSimulationMock = jest
        .spyOn(service, 'processPaymentSimulation')
        .mockImplementation(() => Promise.resolve());
      prismaService.payment.update.mockResolvedValue(mockCompletedPayment);

      const result = await service.createPayment(mockCreatePaymentDto);

      expect(result).toEqual(mockCompletedPayment);
      expect(processPaymentSimulationMock).toHaveBeenCalledTimes(1);
      expect(idempotencyService.checkOrCreate).toHaveBeenCalledWith(
        mockPendingPayment.idempotencyKey,
      );
      expect(prismaService.payment.findUnique).toHaveBeenCalledWith({
        where: { idempotencyKey: mockCreatePaymentDto.idempotencyKey },
      });
      expect(prismaService.payment.create).toHaveBeenCalledWith({
        data: {
          userId: mockCreatePaymentDto.userId,
          amount: mockCreatePaymentDto.amount,
          status: PaymentStatus.PENDING,
          idempotencyKey: mockCreatePaymentDto.idempotencyKey,
        },
      });
      expect(prismaService.payment.update).toHaveBeenCalledWith({
        where: { id: mockPendingPayment.id },
        data: { status: PaymentStatus.COMPLETED },
      });
      expect(idempotencyService.markCompleted).toHaveBeenCalledWith(
        mockCreatePaymentDto.idempotencyKey,
        mockCompletedPayment,
      );
    });
  });
});
