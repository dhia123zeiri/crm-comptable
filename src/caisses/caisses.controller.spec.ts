import { Test, TestingModule } from '@nestjs/testing';
import { CaissesController } from './caisses.controller';

describe('CaissesController', () => {
  let controller: CaissesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CaissesController],
    }).compile();

    controller = module.get<CaissesController>(CaissesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
