import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { ReserveFundsDto } from './dto/reserve-funds.dto';
import { Account, FundReservation, ReservationStatus } from '@prisma/client';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(private prisma: PrismaService) {}

  async createAccount(dto: CreateAccountDto): Promise<Account> {
    const existing = await this.prisma.account.findUnique({
      where: { userId: dto.userId },
    });

    if (existing) {
      throw new BadRequestException('Account already exists for this user');
    }

    const account = await this.prisma.account.create({
      data: {
        userId: dto.userId,
        balance: dto.initialBalance,
        reservedBalance: 0,
      },
    });

    this.logger.log(`Account created for user ${dto.userId}`);
    return account;
  }

  findByUserId(userId: string): Promise<Account | null> {
    return this.prisma.account.findUnique({
      where: { userId },
      include: {
        reservations: {
          where: { status: ReservationStatus.ACTIVE },
        },
      },
    });
  }

  async reserveFunds(dto: ReserveFundsDto): Promise<FundReservation> {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({
        where: { userId: dto.userId },
      });

      if (!account) {
        throw new NotFoundException('Account not found');
      }

      const availableBalance =
        account.balance.toNumber() - account.reservedBalance.toNumber();

      if (availableBalance < dto.amount) {
        throw new BadRequestException(
          `Insufficient funds. Available: ${availableBalance}, Required: ${dto.amount}`,
        );
      }

      const existingReservation = await tx.fundReservation.findUnique({
        where: { paymentId: dto.paymentId },
      });

      if (existingReservation) {
        this.logger.log(
          `Reservation already exists for payment ${dto.paymentId}`,
        );
        return existingReservation;
      }

      const reservation = await tx.fundReservation.create({
        data: {
          accountId: account.id,
          paymentId: dto.paymentId,
          amount: dto.amount,
          status: ReservationStatus.ACTIVE,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });

      await tx.account.update({
        where: { id: account.id },
        data: {
          reservedBalance: {
            increment: dto.amount,
          },
        },
      });

      this.logger.log(
        `Reserved ${dto.amount} for payment ${dto.paymentId} (reservation: ${reservation.id})`,
      );

      return reservation;
    });
  }

  async confirmReservation(paymentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.fundReservation.findUnique({
        where: { paymentId },
        include: { account: true },
      });

      if (!reservation) {
        throw new NotFoundException(
          `Reservation not found for payment ${paymentId}`,
        );
      }

      if (reservation.status === ReservationStatus.CONFIRMED) {
        this.logger.log(`Reservation ${paymentId} already confirmed, skipping`);
        return;
      }

      if (reservation.status !== ReservationStatus.ACTIVE) {
        throw new BadRequestException(
          `Cannot confirm reservation with status ${reservation.status}`,
        );
      }

      await tx.account.update({
        where: { id: reservation.accountId },
        data: {
          balance: { decrement: reservation.amount },
          reservedBalance: { decrement: reservation.amount },
        },
      });

      await tx.fundReservation.update({
        where: { paymentId },
        data: { status: ReservationStatus.CONFIRMED },
      });

      this.logger.log(`Confirmed reservation for payment ${paymentId}`);
    });
  }

  async releaseReservation(paymentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.fundReservation.findUnique({
        where: { paymentId },
      });

      if (!reservation) {
        this.logger.warn(
          `Reservation not found for payment ${paymentId}, nothing to release`,
        );
        return;
      }

      if (reservation.status === ReservationStatus.RELEASED) {
        this.logger.log(`Reservation ${paymentId} already released, skipping`);
        return;
      }

      if (reservation.status !== ReservationStatus.ACTIVE) {
        this.logger.warn(
          `Cannot release reservation with status ${reservation.status}`,
        );
        return;
      }

      await tx.account.update({
        where: { id: reservation.accountId },
        data: {
          reservedBalance: { decrement: reservation.amount },
        },
      });

      await tx.fundReservation.update({
        where: { paymentId },
        data: { status: ReservationStatus.RELEASED },
      });

      this.logger.log(`Released reservation for payment ${paymentId}`);
    });
  }

  findAll(): Promise<Account[]> {
    return this.prisma.account.findMany({
      include: {
        reservations: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  addBalance(userId: string, amount: number): Promise<Account> {
    return this.prisma.account.update({
      where: { userId },
      data: {
        balance: { increment: amount },
      },
    });
  }
}
