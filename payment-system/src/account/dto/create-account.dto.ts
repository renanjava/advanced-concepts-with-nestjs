import { IsNotEmpty, IsNumber, IsPositive, IsUUID } from 'class-validator';

export class CreateAccountDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsNumber()
  @IsPositive()
  initialBalance: number;
}
