import { Test, TestingModule } from '@nestjs/testing';
import { DynamicFormsController } from './dynamic-forms.controller';

describe('DynamicFormsController', () => {
  let controller: DynamicFormsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DynamicFormsController],
    }).compile();

    controller = module.get<DynamicFormsController>(DynamicFormsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
