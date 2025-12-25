/* eslint-disable @typescript-eslint/no-unsafe-return */
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
  $transaction: jest.Mock;
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

  const mockFailedPayment: Payment = {
    ...mockPendingPayment,
    status: PaymentStatus.FAILED,
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
            $transaction: jest.fn(),
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

    prismaService.$transaction.mockImplementation(async (callback: any) => {
      return await callback(prismaService);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Create Payment Method', () => {
    it('should create payment', async () => {
      idempotencyService.checkOrCreate.mockResolvedValue('NEW');
      prismaService.payment.findUnique.mockResolvedValue(null);
      prismaService.payment.create.mockResolvedValue(mockPendingPayment);
      prismaService.payment.update.mockResolvedValue(mockCompletedPayment);

      const processPaymentSimulationMock = jest
        .spyOn(service as any, 'processPaymentSimulation')
        .mockResolvedValue(undefined);

      const result = await service.createPayment(mockCreatePaymentDto);

      expect(result).toEqual(mockCompletedPayment);
      expect(processPaymentSimulationMock).toHaveBeenCalledTimes(1);
      expect(idempotencyService.checkOrCreate).toHaveBeenCalledWith(
        mockIdempotencyKey,
      );
      expect(prismaService.payment.findUnique).toHaveBeenCalledWith({
        where: { idempotencyKey: mockIdempotencyKey },
      });
      expect(prismaService.payment.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          amount: mockAmount,
          status: PaymentStatus.PENDING,
          idempotencyKey: mockIdempotencyKey,
        },
      });
      expect(prismaService.payment.update).toHaveBeenCalledWith({
        where: { id: mockPaymentId },
        data: { status: PaymentStatus.COMPLETED },
      });
      expect(idempotencyService.markCompleted).toHaveBeenCalledWith(
        mockIdempotencyKey,
        mockCompletedPayment,
      );
    });

    it('should return existent payment', async () => {
      idempotencyService.checkOrCreate.mockResolvedValue(mockCompletedPayment);

      const result = await service.createPayment(mockCreatePaymentDto);

      expect(result).toEqual(mockCompletedPayment);
      expect(idempotencyService.checkOrCreate).toHaveBeenCalledWith(
        mockIdempotencyKey,
      );
      expect(prismaService.payment.findUnique).not.toHaveBeenCalled();
      expect(prismaService.payment.create).not.toHaveBeenCalled();
      expect(prismaService.payment.update).not.toHaveBeenCalled();
      expect(idempotencyService.markCompleted).not.toHaveBeenCalled();
    });

    it('should retry failed payment process and update to completed', async () => {
      idempotencyService.checkOrCreate.mockResolvedValue('NEW');
      prismaService.payment.findUnique.mockResolvedValue(mockFailedPayment);
      prismaService.payment.update.mockResolvedValue(mockCompletedPayment);

      const processPaymentSimulationMock = jest
        .spyOn(service as any, 'processPaymentSimulation')
        .mockResolvedValue(undefined);

      const result = await service.createPayment(mockCreatePaymentDto);

      expect(result).toEqual(mockCompletedPayment);
      expect(processPaymentSimulationMock).toHaveBeenCalledTimes(1);
      expect(idempotencyService.checkOrCreate).toHaveBeenCalledWith(
        mockIdempotencyKey,
      );
      expect(prismaService.payment.findUnique).toHaveBeenCalledWith({
        where: { idempotencyKey: mockIdempotencyKey },
      });
      expect(prismaService.payment.create).not.toHaveBeenCalled();
      expect(prismaService.payment.update).toHaveBeenCalledWith({
        where: { id: mockFailedPayment.id },
        data: { status: PaymentStatus.COMPLETED },
      });
      expect(idempotencyService.markCompleted).toHaveBeenCalledWith(
        mockIdempotencyKey,
        mockCompletedPayment,
      );
    });

    it('should handle payment processing failure', async () => {
      const processingError = new Error('Payment gateway timeout');
      idempotencyService.checkOrCreate.mockResolvedValue('NEW');
      prismaService.payment.findUnique.mockResolvedValue(null);
      prismaService.payment.create.mockResolvedValue(mockPendingPayment);
      prismaService.payment.update.mockResolvedValue(mockFailedPayment);

      jest
        .spyOn(service as any, 'processPaymentSimulation')
        .mockRejectedValue(processingError);

      await expect(service.createPayment(mockCreatePaymentDto)).rejects.toThrow(
        processingError,
      );

      expect(prismaService.payment.create).toHaveBeenCalled();
      expect(prismaService.payment.update).toHaveBeenCalledWith({
        where: { id: mockPaymentId },
        data: { status: PaymentStatus.FAILED },
      });
      expect(idempotencyService.markFailed).toHaveBeenCalledWith(
        mockIdempotencyKey,
      );
    });

    it('should throw error when idempotency status is PROCESSING', async () => {
      idempotencyService.checkOrCreate.mockResolvedValue('PROCESSING');

      await expect(service.createPayment(mockCreatePaymentDto)).rejects.toThrow(
        'Request is already being processed',
      );

      expect(prismaService.payment.create).not.toHaveBeenCalled();
      expect(prismaService.payment.update).not.toHaveBeenCalled();
    });
  });

  describe('2. Query Methods', () => {
    it('should find all payments', async () => {
      const payments = [mockCompletedPayment, mockFailedPayment];
      prismaService.payment.findMany.mockResolvedValue(payments);

      const result = await service.findAll();

      expect(result).toEqual(payments);
      expect(prismaService.payment.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should find payment by id', async () => {
      prismaService.payment.findUnique.mockResolvedValue(mockCompletedPayment);

      const result = await service.findOne(mockPaymentId);

      expect(result).toEqual(mockCompletedPayment);
      expect(prismaService.payment.findUnique).toHaveBeenCalledWith({
        where: { id: mockPaymentId },
      });
    });

    it('should return null for non-existent payment', async () => {
      prismaService.payment.findUnique.mockResolvedValue(null);

      const result = await service.findOne('non-existent-id');

      expect(result).toBeNull();
    });
  });
});
