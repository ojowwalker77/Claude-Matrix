// Lazy import - don't load @xenova/transformers until actually needed
// This allows Matrix CLI to work even if sharp native binary failed to install

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIM = 384;

let embedder: unknown = null;
let loadingPromise: Promise<unknown> | null = null;
let transformersError: string | null = null;

async function loadEmbedder(): Promise<unknown> {
  if (embedder) return embedder;
  if (transformersError) throw new Error(transformersError);
  if (loadingPromise) return loadingPromise;

  try {
    // Dynamic import - only loads when needed
    const { pipeline } = await import('@xenova/transformers');

    loadingPromise = pipeline('feature-extraction', MODEL_NAME, {
      quantized: true,
    });

    embedder = await loadingPromise;
    loadingPromise = null;

    return embedder;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    transformersError = `Embeddings unavailable: ${msg}. Run 'bun install' with network access to fix.`;
    throw new Error(transformersError);
  }
}

export async function getEmbedding(text: string): Promise<Float32Array> {
  const model = await loadEmbedder();

  // Truncate very long texts (model has 256 token limit)
  const truncated = text.slice(0, 2000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const output = await (model as any)(truncated, {
    pooling: 'mean',
    normalize: true,
  });

  // output.data is Float32Array
  return new Float32Array(output.data);
}

export async function getEmbeddings(texts: string[]): Promise<Float32Array[]> {
  const model = await loadEmbedder();

  const results: Float32Array[] = [];

  for (const text of texts) {
    const truncated = text.slice(0, 2000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output = await (model as any)(truncated, {
      pooling: 'mean',
      normalize: true,
    });
    results.push(new Float32Array(output.data));
  }

  return results;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  // Since we normalize, this should be close to dot product
  // But compute properly for safety
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export { EMBEDDING_DIM };

// Test if run directly
if (import.meta.main) {
  console.log('Testing embeddings...');
  const start = Date.now();

  const text1 = 'How to implement OAuth with Google in TypeScript';
  const text2 = 'Google OAuth implementation using TypeScript';
  const text3 = 'Making a sandwich with peanut butter';

  const [emb1, emb2, emb3] = await getEmbeddings([text1, text2, text3]);

  console.log(`Loaded model and computed 3 embeddings in ${Date.now() - start}ms`);
  console.log(`Embedding dimension: ${emb1!.length}`);
  console.log(`Similarity (1,2): ${cosineSimilarity(emb1!, emb2!).toFixed(4)} (should be high)`);
  console.log(`Similarity (1,3): ${cosineSimilarity(emb1!, emb3!).toFixed(4)} (should be low)`);
}
