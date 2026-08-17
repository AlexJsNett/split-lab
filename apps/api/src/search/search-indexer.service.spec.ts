import { errors } from '@elastic/elasticsearch';
import { SearchIndexerService } from './search-indexer.service';
import type { SearchConfig } from './search.config';
import type { ExperimentDocument, FlagDocument } from './search-index';

const CONFIG: SearchConfig = {
  url: 'http://localhost:9200',
  experimentsIndex: 'splitlab-test-experiments',
  flagsIndex: 'splitlab-test-flags',
};

function fakeResponseError(
  statusCode: number,
  body?: Record<string, unknown>,
): errors.ResponseError {
  return new errors.ResponseError({
    statusCode,
    body,
    warnings: null,
    meta: {} as never,
  });
}

function createMockClient() {
  return {
    index: jest.fn(),
    delete: jest.fn(),
    indices: { exists: jest.fn() },
  };
}

describe('SearchIndexerService', () => {
  let client: ReturnType<typeof createMockClient>;
  let service: SearchIndexerService;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    client = createMockClient();
    // Every test defaults to "the index exists" — ES's own
    // action.auto_create_index would otherwise silently create the index
    // with a wrong dynamic mapping instead of throwing, which is exactly
    // why indexExperiment/indexFlag check this explicitly (verified live).
    client.indices.exists.mockResolvedValue(true);
    service = new SearchIndexerService(client as never, CONFIG);
    errorSpy = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe('indexExperiment', () => {
    const document: ExperimentDocument = {
      projectId: 'project-1',
      type: 'experiment',
      name: 'Checkout redesign',
      description: 'A/B test on the checkout flow',
      status: 'running',
      flagId: null,
    };

    it('indexes the document with the UUID as _id, into the experiments index', async () => {
      client.index.mockResolvedValueOnce({});

      await service.indexExperiment('experiment-1', document);

      expect(client.index).toHaveBeenCalledWith({
        index: CONFIG.experimentsIndex,
        id: 'experiment-1',
        document,
      });
    });

    it('resolves instead of rejecting when the client throws, and logs', async () => {
      client.index.mockRejectedValueOnce(new Error('cluster unreachable'));

      await expect(
        service.indexExperiment('experiment-1', document),
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
    });

    // ES's action.auto_create_index defaults to ON — client.index() against
    // a missing index does NOT throw index_not_found_exception, it silently
    // auto-creates the index with a wrong dynamic mapping instead (this was
    // discovered live, not theorized). Checking indices.exists() first,
    // rather than only reacting to a thrown error, is what makes this
    // guard actually fire.
    it('logs a distinct message and skips the write when the index is missing', async () => {
      client.indices.exists.mockResolvedValueOnce(false);

      await service.indexExperiment('experiment-1', document);

      expect(client.index).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('search:reindex'),
      );
    });

    it('still logs the distinct message when the client throws index_not_found_exception directly', async () => {
      client.index.mockRejectedValueOnce(
        fakeResponseError(404, {
          error: { type: 'index_not_found_exception' },
        }),
      );

      await service.indexExperiment('experiment-1', document);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('search:reindex'),
      );
    });
  });

  describe('indexFlag', () => {
    const document: FlagDocument = {
      projectId: 'project-1',
      type: 'flag',
      key: 'new-checkout',
      description: 'Rollout of the new checkout',
      enabled: true,
    };

    it('indexes the document with the UUID as _id, into the flags index', async () => {
      client.index.mockResolvedValueOnce({});

      await service.indexFlag('flag-1', document);

      expect(client.index).toHaveBeenCalledWith({
        index: CONFIG.flagsIndex,
        id: 'flag-1',
        document,
      });
    });

    it('resolves instead of rejecting when the client throws, and logs', async () => {
      client.index.mockRejectedValueOnce(new Error('timeout'));

      await expect(
        service.indexFlag('flag-1', document),
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('removeExperiment', () => {
    it('deletes the document by id, no lookup', async () => {
      client.delete.mockResolvedValueOnce({});

      await service.removeExperiment('experiment-1');

      expect(client.delete).toHaveBeenCalledWith({
        index: CONFIG.experimentsIndex,
        id: 'experiment-1',
      });
    });

    it('tolerates a 404 as success, with no error logged', async () => {
      client.delete.mockRejectedValueOnce(fakeResponseError(404));

      await expect(
        service.removeExperiment('experiment-1'),
      ).resolves.toBeUndefined();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('logs, but still resolves, on a non-404 failure', async () => {
      client.delete.mockRejectedValueOnce(fakeResponseError(500));

      await expect(
        service.removeExperiment('experiment-1'),
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
    });

    // A 404 from a missing index and a 404 from a missing document look
    // identical at the statusCode level — only the response body tells
    // them apart. A missing index must NOT be silently treated as
    // "already deleted," or the "run search:reindex" signal never fires.
    it('logs the distinct missing-index message rather than treating it as an already-deleted document', async () => {
      client.delete.mockRejectedValueOnce(
        fakeResponseError(404, {
          error: { type: 'index_not_found_exception' },
        }),
      );

      await service.removeExperiment('experiment-1');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('search:reindex'),
      );
    });
  });

  describe('removeFlag', () => {
    it('deletes the document by id, no lookup', async () => {
      client.delete.mockResolvedValueOnce({});

      await service.removeFlag('flag-1');

      expect(client.delete).toHaveBeenCalledWith({
        index: CONFIG.flagsIndex,
        id: 'flag-1',
      });
    });

    it('tolerates a 404 as success', async () => {
      client.delete.mockRejectedValueOnce(fakeResponseError(404));

      await expect(service.removeFlag('flag-1')).resolves.toBeUndefined();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
