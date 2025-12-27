import { Controller, Post, Get, Body, Param, Query } from "@nestjs/common";
import { OrdersService } from "./orders.service";
import { CreateOrderDTO } from "@repo/shared-types";

@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async create(@Body() dto: CreateOrderDTO) {
    return this.ordersService.createOrder(dto);
  }

  @Get(":id")
  async getOne(@Param("id") id: string) {
    return this.ordersService.getOrder(id);
  }

  @Get()
  async list(@Query("userId") userId?: string) {
    return this.ordersService.listOrders(userId);
  }
}
