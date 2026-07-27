import { PartialType } from '@nestjs/swagger';
import { CreateAllowedDomainDto } from './create-allowed-domain.dto';

export class UpdateAllowedDomainDto extends PartialType(CreateAllowedDomainDto) {}
