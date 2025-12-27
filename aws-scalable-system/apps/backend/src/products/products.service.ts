import { Injectable, NotFoundException } from "@nestjs/common";
import { ProductsRepository } from "./products.repository";
import type { Product } from "@repo/database";

export interface CreateProductDTO {
  name: string;
  price: number;
  stock: number;
}

export interface UpdateProductDTO {
  name?: string;
  price?: number;
  stock?: number;
}

@Injectable()
export class ProductsService {
  constructor(private readonly repo: ProductsRepository) {}

  create(data: CreateProductDTO): Promise<Product> {
    return this.repo.create(data as any);
  }

  async getOne(id: string): Promise<Product> {
    const p = await this.repo.findById(id);
    if (!p) throw new NotFoundException("Product not found");
    return p;
  }

  list(limit?: number): Promise<Product[]> {
    return this.repo.findMany(limit);
  }

  async update(id: string, data: UpdateProductDTO): Promise<Product> {
    await this.getOne(id);
    return this.repo.update(id, data as any);
  }

  async remove(id: string): Promise<Product> {
    await this.getOne(id);
    return this.repo.delete(id);
  }
}
