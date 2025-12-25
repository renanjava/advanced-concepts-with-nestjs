import { Module } from '@nestjs/common';
import { PaymentModule } from './payment/payment.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AccountModule } from './account/account.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PaymentModule,
    PrismaModule,
    AccountModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
