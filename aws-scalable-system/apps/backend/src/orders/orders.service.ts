import { Injectable } from "@nestjs/common";
import { prisma } from "@repo/database";
import { CreateOrderDTO, OrderResponse } from "@repo/shared-types";

@Injectable()
export class OrdersService {
  async createOrder(dto: CreateOrderDTO): Promise<OrderResponse> {
    const product = await prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new Error("Product not found");
    }

    if (product.stock < dto.quantity) {
      throw new Error("Insufficient stock");
    }

    const order = await prisma.order.create({
      data: {
        userId: dto.userId,
        productId: dto.productId,
        quantity: dto.quantity,
        totalPrice: product.price * dto.quantity,
        status: "pending",
      },
    });

    await prisma.product.update({
      where: { id: dto.productId },
      data: { stock: product.stock - dto.quantity },
    });

    return order;
  }

  async getOrder(id: string): Promise<OrderResponse | null> {
    return prisma.order.findUnique({ where: { id } });
  }

  async listOrders(userId?: string): Promise<OrderResponse[]> {
    return prisma.order.findMany({
      where: userId ? { userId } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
