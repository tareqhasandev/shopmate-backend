import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(storeId: string) {
    return this.prisma.category.findMany({
      where: { storeId },
      select: { id: true, name: true, slug: true, description: true, createdAt: true, updatedAt: true },
      orderBy: { name: 'asc' },
    });
  }
}
