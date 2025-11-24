import { Test, TestingModule } from '@nestjs/testing';
import { DossierService } from './dossier.service';

describe('DossierService', () => {
  let service: DossierService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DossierService],
    }).compile();

    service = module.get<DossierService>(DossierService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
