export interface CreateOrderDTO {
  userId: string;
  productId: string;
  quantity: number;
}

export interface OrderResponse {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  totalPrice: number;
  status: string;
  createdAt: Date;
}

export interface HealthCheck {
  status: "ok" | "error";
  timestamp: number;
  service: string;
  uptime: number;
}
