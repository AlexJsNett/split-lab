import { ConfigService } from '@nestjs/config';
import { buildSearchConfig } from './search.config';

function fakeConfigService(values: Record<string, string>): ConfigService {
  return {
    getOrThrow: (key: string) => {
      if (!(key in values)) {
        throw new Error(`Missing required env var ${key}`);
      }
      return values[key];
    },
  } as unknown as ConfigService;
}

describe('buildSearchConfig', () => {
  it('builds index names from the URL and prefix', () => {
    const config = buildSearchConfig(
      fakeConfigService({
        ELASTICSEARCH_URL: 'http://localhost:9200',
        ELASTICSEARCH_INDEX_PREFIX: 'splitlab',
      }),
    );

    expect(config).toEqual({
      url: 'http://localhost:9200',
      experimentsIndex: 'splitlab-experiments',
      flagsIndex: 'splitlab-flags',
    });
  });

  it('isolates test indices behind a different prefix', () => {
    const config = buildSearchConfig(
      fakeConfigService({
        ELASTICSEARCH_URL: 'http://localhost:9200',
        ELASTICSEARCH_INDEX_PREFIX: 'splitlab-test',
      }),
    );

    expect(config.experimentsIndex).toEqual('splitlab-test-experiments');
    expect(config.flagsIndex).toEqual('splitlab-test-flags');
  });

  it('fails fast when the URL is missing', () => {
    expect(() =>
      buildSearchConfig(
        fakeConfigService({ ELASTICSEARCH_INDEX_PREFIX: 'splitlab' }),
      ),
    ).toThrow('ELASTICSEARCH_URL');
  });

  it('fails fast when the index prefix is missing', () => {
    expect(() =>
      buildSearchConfig(
        fakeConfigService({ ELASTICSEARCH_URL: 'http://localhost:9200' }),
      ),
    ).toThrow('ELASTICSEARCH_INDEX_PREFIX');
  });
});
