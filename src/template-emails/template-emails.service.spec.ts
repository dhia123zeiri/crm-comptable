import { Test, TestingModule } from '@nestjs/testing';
import { TemplateEmailsService } from './services/template-emails.service';

describe('TemplateEmailsService', () => {
  let service: TemplateEmailsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TemplateEmailsService],
    }).compile();

    service = module.get<TemplateEmailsService>(TemplateEmailsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
