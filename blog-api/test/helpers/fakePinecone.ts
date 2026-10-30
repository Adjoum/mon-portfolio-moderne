// Index Pinecone en mémoire (embedding intégré simulé) pour les tests
import { vi } from 'vitest';

export interface FakeRecord { id: string; text: string; [field: string]: unknown }

const records = new Map<string, FakeRecord>();

export const fakeIndex = {
  describeIndexStats: vi.fn(async () => ({ totalRecordCount: records.size })),
  searchRecords: vi.fn(async ({ query }: { query: { inputs: { text: string }; topK: number } }) => ({
    result: {
      hits: [...records.values()].slice(0, query.topK).map(r => ({
        _id: r.id,
        _score: 0.9,
        fields: { ...r },
      })),
    },
  })),
  upsertRecords: vi.fn(async ({ records: batch }: { records: FakeRecord[] }) => {
    for (const r of batch) records.set(r.id, r);
  }),
  deleteOne: vi.fn(async ({ id }: { id: string }) => { records.delete(id); }),
  namespace() { return { deleteOne: fakeIndex.deleteOne }; },
};

export function resetFakeIndex() {
  records.clear();
  for (const fn of [fakeIndex.describeIndexStats, fakeIndex.searchRecords, fakeIndex.upsertRecords, fakeIndex.deleteOne]) {
    fn.mockClear();
  }
}

export function seedRecord(record: FakeRecord) {
  records.set(record.id, record);
}

export function storedRecords() {
  return [...records.values()];
}
