import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns status ok', () => {
    const controller = new HealthController();

    expect(controller.check()).toEqual({ status: 'ok' });
  });
});

describe('deliberate M14 red-run proof, revert immediately', () => {
  it('should fail on purpose', () => {
    expect(true).toBe(false);
  });
});
