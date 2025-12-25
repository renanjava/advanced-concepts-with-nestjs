/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  create(@Body() dto: CreatePaymentDto) {
    return this.paymentService.createPayment(dto);
  }

  @Get()
  findAll() {
    return this.paymentService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentService.findOne(id);
  }

  @Get(':id/saga')
  findSagaExecution(@Param('id') paymentId: string) {
    return this.paymentService.findSagaExecution(paymentId);
  }
}
