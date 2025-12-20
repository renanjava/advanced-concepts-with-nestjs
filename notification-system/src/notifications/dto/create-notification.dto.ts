import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class CreateNotificationDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
