import { Test, TestingModule } from '@nestjs/testing';
import { DynamicFormsService } from './dynamic-forms.service';

describe('DynamicFormsService', () => {
  let service: DynamicFormsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DynamicFormsService],
    }).compile();

    service = module.get<DynamicFormsService>(DynamicFormsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
