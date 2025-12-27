import { Injectable } from "@nestjs/common";
import { prisma } from "@repo/database";
import type { Product } from "@repo/database";

@Injectable()
export class ProductsRepository {
  async create(data: Omit<Product, "id" | "createdAt" | "updatedAt">) {
    return prisma.product.create({ data });
  }

  async findById(id: string) {
    return prisma.product.findUnique({ where: { id } });
  }

  async findMany(limit = 100) {
    return prisma.product.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
    });
  }

  async update(id: string, data: Partial<Product>) {
    return prisma.product.update({ where: { id }, data });
  }

  async delete(id: string) {
    return prisma.product.delete({ where: { id } });
  }
}
