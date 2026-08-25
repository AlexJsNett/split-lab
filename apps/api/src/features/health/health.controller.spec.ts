import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns status ok', () => {
    const controller = new HealthController();

    expect(controller.check()).toEqual({ status: 'ok' });
  });
});

describe('deliberate M14 gate re-verify, revert immediately', () => {
  it('should fail on purpose', () => {
    expect(true).toBe(false);
  });
});
