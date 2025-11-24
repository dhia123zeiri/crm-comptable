import { Test, TestingModule } from '@nestjs/testing';
import { DossierController } from './dossier.controller';

describe('DossierController', () => {
  let controller: DossierController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DossierController],
    }).compile();

    controller = module.get<DossierController>(DossierController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
