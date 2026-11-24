import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  create(storeId: string, dto: CreateCustomerDto) {
    const email = dto.email.trim().toLowerCase();
    return this.prisma.customer.create({
      data: { storeId, fullName: dto.fullName.trim(), email, phone: dto.phone?.trim() || null },
      select: { id: true, fullName: true, email: true, phone: true, createdAt: true, updatedAt: true },
    });
  }
}
