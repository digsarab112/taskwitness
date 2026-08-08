import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { RUNTIME_DIRECTORY, SESSION_SCHEMA_VERSION } from '../domain/constants.js';
import {
  SessionSchema,
  type Baseline,
  type Session,
  type TaskContract,
} from '../domain/schemas.js';
import {
  ensureDirectory,
  isNodeError,
  pathExists,
  readJson,
  writeJsonAtomic,
  writeUtf8Atomic,
} from '../utils/fs.js';

export class SessionStore {
  readonly runtimeRoot: string;
  readonly sessionsRoot: string;
  readonly reportsRoot: string;
  private readonly currentPath: string;

  constructor(readonly repositoryRoot: string) {
    this.runtimeRoot = path.join(repositoryRoot, RUNTIME_DIRECTORY);
    this.sessionsRoot = path.join(this.runtimeRoot, 'sessions');
    this.reportsRoot = path.join(this.runtimeRoot, 'reports');
    this.currentPath = path.join(this.runtimeRoot, 'current');
  }

  async initialize(): Promise<void> {
    await Promise.all([
      ensureDirectory(this.sessionsRoot),
      ensureDirectory(this.reportsRoot),
    ]);
  }

  async create(contract: TaskContract, baseline: Baseline): Promise<Session> {
    await this.initialize();
    const createdAt = new Date().toISOString();
    const id = `${createdAt.replace(/[-:.TZ]/gu, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`;
    const session: Session = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      id,
      contract,
      baseline,
      createdAt,
      completedAt: null,
    };
    await writeJsonAtomic(this.sessionPath(id), SessionSchema.parse(session));
    await writeUtf8Atomic(this.currentPath, `${id}\n`);
    return session;
  }

  async active(): Promise<Session> {
    let id: string;
    try {
      id = (await readFile(this.currentPath, 'utf8')).trim();
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        throw new Error('No active TaskWitness session. Run taskwitness start first.');
      }
      throw error;
    }
    if (id === '') throw new Error('The active TaskWitness session pointer is empty.');
    return readJson(this.sessionPath(id), SessionSchema);
  }

  async complete(session: Session): Promise<Session> {
    const completed: Session = { ...session, completedAt: new Date().toISOString() };
    await writeJsonAtomic(this.sessionPath(session.id), SessionSchema.parse(completed));
    return completed;
  }

  reportDirectory(sessionId: string): string {
    return path.join(this.reportsRoot, sessionId);
  }

  async hasActiveSession(): Promise<boolean> {
    return pathExists(this.currentPath);
  }

  private sessionPath(id: string): string {
    if (!/^[a-zA-Z0-9-]+$/u.test(id)) throw new Error('Invalid TaskWitness session ID.');
    return path.join(this.sessionsRoot, `${id}.json`);
  }
}
