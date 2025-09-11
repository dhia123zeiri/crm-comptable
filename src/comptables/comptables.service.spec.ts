import { Test, TestingModule } from '@nestjs/testing';
import { ComptablesService } from './comptables.service';

describe('ComptablesService', () => {
  let service: ComptablesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ComptablesService],
    }).compile();

    service = module.get<ComptablesService>(ComptablesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
