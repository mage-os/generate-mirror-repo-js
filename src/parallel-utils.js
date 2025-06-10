/**
 * Utility functions for parallel processing with concurrency control
 */

/**
 * Process items in parallel with a concurrency limit
 * @param {Array} items - Array of items to process
 * @param {Function} processFn - Async function to process each item
 * @param {number} concurrency - Maximum number of concurrent operations
 * @returns {Promise<Array>} Results in the same order as input
 */
async function parallelMap(items, processFn, concurrency = 10) {
  const results = new Array(items.length);
  const executing = [];
  
  for (let i = 0; i < items.length; i++) {
    const promise = processFn(items[i], i).then(result => {
      results[i] = result;
      // Remove from executing array when done
      const index = executing.indexOf(promise);
      if (index > -1) {
        executing.splice(index, 1);
      }
    });
    
    executing.push(promise);
    
    // If we've reached the concurrency limit, wait for one to complete
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }
  
  // Wait for all remaining operations to complete
  await Promise.all(executing);
  return results;
}

/**
 * Process items in batches
 * @param {Array} items - Array of items to process
 * @param {Function} processFn - Async function to process each item
 * @param {number} batchSize - Number of items per batch
 * @returns {Promise<Array>} Flattened results
 */
async function batchProcess(items, processFn, batchSize = 10) {
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((item, index) => processFn(item, i + index))
    );
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Create a pool of workers that process items from a queue
 * @param {number} workerCount - Number of concurrent workers
 * @returns {Object} Pool object with add() and drain() methods
 */
function createWorkerPool(workerCount = 10) {
  const queue = [];
  const workers = [];
  let closed = false;
  
  const processNext = async (workerId) => {
    while (queue.length > 0 && !closed) {
      const { item, processFn, resolve, reject } = queue.shift();
      try {
        const result = await processFn(item);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }
  };
  
  // Start workers
  for (let i = 0; i < workerCount; i++) {
    workers.push(processNext(i));
  }
  
  return {
    add(item, processFn) {
      return new Promise((resolve, reject) => {
        queue.push({ item, processFn, resolve, reject });
      });
    },
    
    async drain() {
      closed = true;
      await Promise.all(workers);
    }
  };
}

module.exports = {
  parallelMap,
  batchProcess,
  createWorkerPool
};