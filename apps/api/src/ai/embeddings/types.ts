/**
 * Our embeddings interface (not LangChain's `Embeddings`): the contextualized
 * endpoint takes grouped chunks per document, which the flat interface can't
 * express (docs/02).
 */
export interface EmbeddingsProvider {
  /** One vector per chunk, per group. Groups = section bundles of ONE document. */
  embedChunkGroups(groups: string[][]): Promise<number[][][]>;
  embedQuery(text: string): Promise<number[]>;
}
