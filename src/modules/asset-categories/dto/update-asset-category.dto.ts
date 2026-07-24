import { PartialType } from '@nestjs/swagger';
import { CreateAssetCategoryDto } from './create-asset-category.dto';

export class UpdateAssetCategoryDto extends PartialType(CreateAssetCategoryDto) {}
