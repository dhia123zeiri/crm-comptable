import { Test, TestingModule } from '@nestjs/testing';
import { CaissesService } from './caisses.service';

describe('CaissesService', () => {
  let service: CaissesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CaissesService],
    }).compile();

    service = module.get<CaissesService>(CaissesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
