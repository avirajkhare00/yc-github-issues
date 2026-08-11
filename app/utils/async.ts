/**
 * Maps over items concurrently, keeping at most `limit` operations in flight.
 * Results are returned in the same order as the input.
 * @param items Items to map over
 * @param limit Maximum number of concurrent operations
 * @param mapper Async function applied to each item
 * @returns Array of results, in input order
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  // Each worker pulls the next unclaimed item until the queue is drained
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  };

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));

  return results;
}
