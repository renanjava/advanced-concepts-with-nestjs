import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import { AccountService } from './account.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { ReserveFundsDto } from './dto/reserve-funds.dto';

@Controller('accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post()
  createAccount(@Body() dto: CreateAccountDto) {
    return this.accountService.createAccount(dto);
  }

  @Get()
  findAll() {
    return this.accountService.findAll();
  }

  @Get('user/:userId')
  findByUserId(@Param('userId') userId: string) {
    return this.accountService.findByUserId(userId);
  }

  @Post('reserve')
  @HttpCode(HttpStatus.OK)
  reserveFunds(@Body() dto: ReserveFundsDto) {
    return this.accountService.reserveFunds(dto);
  }

  @Post('confirm/:paymentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmReservation(@Param('paymentId') paymentId: string) {
    await this.accountService.confirmReservation(paymentId);
  }

  @Post('release/:paymentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async releaseReservation(@Param('paymentId') paymentId: string) {
    await this.accountService.releaseReservation(paymentId);
  }

  @Patch('user/:userId/add-balance')
  addBalance(@Param('userId') userId: string, @Body('amount') amount: number) {
    return this.accountService.addBalance(userId, amount);
  }
}
