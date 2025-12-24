import { IsNotEmpty, IsNumber, IsPositive, IsUUID } from 'class-validator';

export class CreatePaymentDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsNumber()
  @IsPositive()
  amount: number;
}
