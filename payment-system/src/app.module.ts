import { Module } from '@nestjs/common';
import { PaymentModule } from './payment/payment.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AccountModule } from './account/account.module';
import { GatewayModule } from './gateway/gateway.module';
import { LedgerModule } from './ledger/ledger.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PaymentModule,
    PrismaModule,
    AccountModule,
    GatewayModule,
    LedgerModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
