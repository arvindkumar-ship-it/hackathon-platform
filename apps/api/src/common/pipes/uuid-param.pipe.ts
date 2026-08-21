import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { validate as isUuid } from 'uuid';

@Injectable()
export class UuidParamPipe implements PipeTransform {
  transform(value: string, metadata: ArgumentMetadata) {
    if (metadata.type === 'param' && !isUuid(value)) {
      throw new BadRequestException('Invalid UUID parameter');
    }

    return value;
  }
}
