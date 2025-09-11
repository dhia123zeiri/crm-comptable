import { Test, TestingModule } from '@nestjs/testing';
import { CronSchedulerService } from './cron-scheduler.service';

describe('CronSchedulerService', () => {
  let service: CronSchedulerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CronSchedulerService],
    }).compile();

    service = module.get<CronSchedulerService>(CronSchedulerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
