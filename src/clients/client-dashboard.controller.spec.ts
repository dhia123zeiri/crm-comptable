import { Test, TestingModule } from '@nestjs/testing';
import { ClientDashboardController } from './client-dashboard.controller';

describe('ClientDashboardController', () => {
  let controller: ClientDashboardController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientDashboardController],
    }).compile();

    controller = module.get<ClientDashboardController>(ClientDashboardController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
