import { Test, TestingModule } from '@nestjs/testing';
import { FacturesController } from './factures.controller';

describe('FacturesController', () => {
  let controller: FacturesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FacturesController],
    }).compile();

    controller = module.get<FacturesController>(FacturesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
