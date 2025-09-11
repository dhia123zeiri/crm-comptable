import { Test, TestingModule } from '@nestjs/testing';
import { TemplateEmailsController } from './template-emails.controller';

describe('TemplateEmailsController', () => {
  let controller: TemplateEmailsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplateEmailsController],
    }).compile();

    controller = module.get<TemplateEmailsController>(TemplateEmailsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
