import type { EvidenceRecord } from '../domain/schemas.js';

export type NewEvidence = Omit<EvidenceRecord, 'id' | 'createdAt'>;

export class EvidenceFactory {
  private nextId = 1;
  private readonly records: EvidenceRecord[] = [];

  add(evidence: NewEvidence): EvidenceRecord {
    const record: EvidenceRecord = {
      ...evidence,
      id: `EV-${String(this.nextId).padStart(3, '0')}`,
      createdAt: new Date().toISOString(),
    };
    this.nextId += 1;
    this.records.push(record);
    return record;
  }

  all(): EvidenceRecord[] {
    return [...this.records];
  }
}
