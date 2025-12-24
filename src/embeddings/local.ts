// Lazy import - don't load @xenova/transformers until actually needed
// This allows Matrix CLI to work even if sharp native binary failed to install

// Re-export pure utilities (no transformers dependency)
export { cosineSimilarity, EMBEDDING_DIM } from './utils.js';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

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

// Test if run directly
if (import.meta.main) {
  const { cosineSimilarity } = await import('./utils.js');

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
