import { IsNotEmpty, IsNumber, IsPositive, IsUUID } from 'class-validator';

export class ReserveFundsDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsUUID()
  @IsNotEmpty()
  paymentId: string;

  @IsNumber()
  @IsPositive()
  amount: number;
}
