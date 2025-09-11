import { Test, TestingModule } from '@nestjs/testing';
import { ComptablesController } from './comptables.controller';

describe('ComptablesController', () => {
  let controller: ComptablesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ComptablesController],
    }).compile();

    controller = module.get<ComptablesController>(ComptablesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
