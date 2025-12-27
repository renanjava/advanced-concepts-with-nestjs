import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from "@nestjs/common";
import {
  ProductsService,
  CreateProductDTO,
  UpdateProductDTO,
} from "./products.service";

@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  async create(@Body() dto: CreateProductDTO) {
    return this.productsService.create(dto);
  }

  @Get(":id")
  async getOne(@Param("id") id: string) {
    return this.productsService.getOne(id);
  }

  @Get()
  async list(@Query("limit") limit?: string) {
    return this.productsService.list(limit ? Number(limit) : undefined);
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateProductDTO) {
    return this.productsService.update(id, dto);
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    return this.productsService.remove(id);
  }
}
