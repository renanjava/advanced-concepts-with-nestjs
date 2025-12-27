import { Module } from "@nestjs/common";
import { OrdersModule } from "./orders/orders.module";
import { HealthModule } from "./health/health.module";
import { ProductsModule } from "./products/products.module";

@Module({
  imports: [OrdersModule, HealthModule, ProductsModule],
})
export class AppModule {}
