import { Injectable, HttpException } from "@nestjs/common";
import { CreateOrderDTO } from "@repo/shared-types";

@Injectable()
export class OrdersService {
  private backendUrl = process.env.BACKEND_URL || "http://localhost:3001";

  async createOrder(dto: CreateOrderDTO) {
    const response = await fetch(`${this.backendUrl}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dto),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new HttpException(error, response.status);
    }

    return response.json();
  }

  async getOrder(id: string) {
    const response = await fetch(`${this.backendUrl}/orders/${id}`);

    if (!response.ok) {
      throw new HttpException("Order not found", 404);
    }

    return response.json();
  }

  async listOrders(userId?: string) {
    const url = userId
      ? `${this.backendUrl}/orders?userId=${userId}`
      : `${this.backendUrl}/orders`;

    const response = await fetch(url);
    return response.json();
  }
}
