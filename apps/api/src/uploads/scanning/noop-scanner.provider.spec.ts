import { NoopScannerProvider } from './noop-scanner.provider';

describe('Missing content scanner', () => {
  it('does not mark unscanned content safe', async () => {
    const result = await new NoopScannerProvider().scan({
      storageKey: 'fixture', mimeType: 'application/pdf', fileSize: 42,
    });
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/not configured/);
  });
});
