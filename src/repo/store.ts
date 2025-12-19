import { randomUUID } from 'crypto';
import { getDb, embeddingToBuffer, bufferToEmbedding } from '../db/index.js';
import { getEmbedding, EMBEDDING_DIM } from '../embeddings/index.js';
import { type DetectedRepo, fingerprintToText } from './fingerprint.js';

interface RepoRow {
  id: string;
  name: string;
  path: string | null;
  languages: string;
  frameworks: string;
  dependencies: string;
  patterns: string;
  test_framework: string | null;
  fingerprint_embedding: Uint8Array | null;
}

export function getRepoByPath(path: string): RepoRow | null {
  const db = getDb();
  return db.query('SELECT * FROM repos WHERE path = ?').get(path) as RepoRow | null;
}

export function getRepoById(id: string): RepoRow | null {
  const db = getDb();
  return db.query('SELECT * FROM repos WHERE id = ?').get(id) as RepoRow | null;
}

export function getRepoEmbedding(repoId: string): Float32Array | null {
  const repo = getRepoById(repoId);
  if (!repo?.fingerprint_embedding) return null;
  try {
    const embedding = bufferToEmbedding(repo.fingerprint_embedding as unknown as Buffer);
    if (embedding.length !== EMBEDDING_DIM) return null;
    return embedding;
  } catch {
    return null;
  }
}

export async function getOrCreateRepo(detected: DetectedRepo): Promise<string> {
  const db = getDb();

  // Check if repo exists by path
  const existing = getRepoByPath(detected.root);

  if (existing) {
    // Update fingerprint if changed
    const currentLangs = JSON.stringify(detected.languages);
    const currentFrameworks = JSON.stringify(detected.frameworks);
    const currentDeps = JSON.stringify(detected.dependencies);
    const currentPatterns = JSON.stringify(detected.patterns);

    if (existing.languages !== currentLangs ||
        existing.frameworks !== currentFrameworks ||
        existing.dependencies !== currentDeps ||
        existing.patterns !== currentPatterns) {

      // Regenerate embedding
      const text = fingerprintToText(detected);
      const embedding = await getEmbedding(text);
      const embBuffer = embeddingToBuffer(embedding);

      db.query(`
        UPDATE repos SET
          name = ?,
          languages = ?,
          frameworks = ?,
          dependencies = ?,
          patterns = ?,
          test_framework = ?,
          fingerprint_embedding = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        detected.name,
        currentLangs,
        currentFrameworks,
        currentDeps,
        currentPatterns,
        detected.testFramework,
        embBuffer,
        existing.id
      );
    }

    return existing.id;
  }

  // Create new repo
  const id = `repo_${randomUUID().slice(0, 8)}`;
  const text = fingerprintToText(detected);
  const embedding = await getEmbedding(text);
  const embBuffer = embeddingToBuffer(embedding);

  db.query(`
    INSERT INTO repos (id, name, path, languages, frameworks, dependencies, patterns, test_framework, fingerprint_embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    detected.name,
    detected.root,
    JSON.stringify(detected.languages),
    JSON.stringify(detected.frameworks),
    JSON.stringify(detected.dependencies),
    JSON.stringify(detected.patterns),
    detected.testFramework,
    embBuffer
  );

  return id;
}

export function getAllReposWithEmbeddings(): Array<{ id: string; embedding: Float32Array }> {
  const db = getDb();
  const rows = db.query(`
    SELECT id, fingerprint_embedding FROM repos WHERE fingerprint_embedding IS NOT NULL
  `).all() as Array<{ id: string; fingerprint_embedding: Uint8Array }>;

  const results: Array<{ id: string; embedding: Float32Array }> = [];
  for (const row of rows) {
    try {
      const embedding = bufferToEmbedding(row.fingerprint_embedding as unknown as Buffer);
      if (embedding.length !== EMBEDDING_DIM) continue;
      results.push({ id: row.id, embedding });
    } catch {
      continue;
    }
  }
  return results;
}
