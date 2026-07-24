import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetCategory } from './entities/asset-category.entity';
import { CreateAssetCategoryDto } from './dto/create-asset-category.dto';
import { UpdateAssetCategoryDto } from './dto/update-asset-category.dto';

@Injectable()
export class AssetCategoriesService {
  constructor(@InjectRepository(AssetCategory) private repo: Repository<AssetCategory>) {}

  create(dto: CreateAssetCategoryDto) { return this.repo.save(this.repo.create(dto)); }
  findAll() { return this.repo.find({ relations: ['parent'] }); }
  async findOne(id: number) {
    const c = await this.repo.findOne({ where: { categoryId: id }, relations: ['parent', 'children'] });
    if (!c) throw new NotFoundException(`ไม่พบหมวดหมู่ id ${id}`);
    return c;
  }
  async update(id: number, dto: UpdateAssetCategoryDto) {
    const c = await this.findOne(id);
    Object.assign(c, dto);
    return this.repo.save(c);
  }
  async remove(id: number) {
    const c = await this.findOne(id);
    await this.repo.remove(c);
    return { success: true };
  }
}
