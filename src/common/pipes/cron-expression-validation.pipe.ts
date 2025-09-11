import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
const cronParser = require('cron-parser');

@Injectable()
export class CronExpressionValidationPipe implements PipeTransform {
  transform(value: any) {
    // If no cron expression is provided, just return value
    if (!value?.cronExpression) {
      return value;
    }

    try {
      cronParser.parseExpression(value.cronExpression);
      return value;
    } catch {
      throw new BadRequestException('Expression cron ');
    }
  }
}
