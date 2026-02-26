/**
 * Tests for src/packagist.js
 *
 * This module provides functionality to interact with the Packagist API
 * to fetch and check package availability with caching and pagination support.
 */

const { EventEmitter } = require('events');

// Mock the https module before requiring the module under test
jest.mock('https');

describe('packagist module', () => {
  let packagist;
  let https;

  /**
   * Helper to create a mock HTTPS response
   * @param {Object} data - The response data to return as JSON
   * @param {boolean} emitError - Whether to emit an error event
   * @param {string} errorMessage - The error message if emitting error
   * @returns {Object} Mock request object with on method
   */
  function createMockResponse(data, emitError = false, errorMessage = 'Network error') {
    const mockResponse = new EventEmitter();
    const mockRequest = new EventEmitter();

    https.get.mockImplementationOnce((url, callback) => {
      if (!emitError) {
        // Schedule the callback and events asynchronously
        setImmediate(() => {
          callback(mockResponse);
          setImmediate(() => {
            mockResponse.emit('data', JSON.stringify(data));
            mockResponse.emit('end');
          });
        });
      } else {
        // Emit error on the request
        setImmediate(() => {
          mockRequest.emit('error', new Error(errorMessage));
        });
      }
      return mockRequest;
    });

    return mockRequest;
  }

  /**
   * Helper to create a mock HTTPS response with invalid JSON
   * @returns {Object} Mock request object
   */
  function createMockInvalidJsonResponse() {
    const mockResponse = new EventEmitter();
    const mockRequest = new EventEmitter();

    https.get.mockImplementationOnce((url, callback) => {
      setImmediate(() => {
        callback(mockResponse);
        setImmediate(() => {
          mockResponse.emit('data', 'not valid json {{{');
          mockResponse.emit('end');
        });
      });
      return mockRequest;
    });

    return mockRequest;
  }

  /**
   * Helper to set up multiple paginated responses
   * @param {Array<Object>} pages - Array of response objects for each page
   */
  function setupPaginatedResponses(pages) {
    pages.forEach((pageData) => {
      createMockResponse(pageData);
    });
  }

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Reset the module to clear the internal cache
    jest.resetModules();

    // Re-require https to get the fresh mock after module reset
    https = require('https');

    // Re-require the module to get a fresh instance with empty cache
    packagist = require('../../src/packagist');
  });

  describe('fetchPackagistList', () => {
    describe('successful requests', () => {
      it('should return a Set of package names for a valid vendor', async () => {
        const mockData = {
          results: [
            { name: 'mage-os/package-one', description: 'Package One' },
            { name: 'mage-os/package-two', description: 'Package Two' },
            { name: 'mage-os/package-three', description: 'Package Three' }
          ],
          total: 3,
          next: null
        };

        createMockResponse(mockData);

        const result = await packagist.fetchPackagistList('mage-os');

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(3);
        expect(result.has('mage-os/package-one')).toBe(true);
        expect(result.has('mage-os/package-two')).toBe(true);
        expect(result.has('mage-os/package-three')).toBe(true);
      });

      it('should handle pagination correctly', async () => {
        const page1 = {
          results: [
            { name: 'vendor/package-1' },
            { name: 'vendor/package-2' }
          ],
          total: 5,
          next: 'https://packagist.org/search.json?q=vendor/&page=2'
        };

        const page2 = {
          results: [
            { name: 'vendor/package-3' },
            { name: 'vendor/package-4' }
          ],
          total: 5,
          next: 'https://packagist.org/search.json?q=vendor/&page=3'
        };

        const page3 = {
          results: [
            { name: 'vendor/package-5' }
          ],
          total: 5,
          next: null
        };

        setupPaginatedResponses([page1, page2, page3]);

        const result = await packagist.fetchPackagistList('vendor');

        expect(result.size).toBe(5);
        expect(result.has('vendor/package-1')).toBe(true);
        expect(result.has('vendor/package-2')).toBe(true);
        expect(result.has('vendor/package-3')).toBe(true);
        expect(result.has('vendor/package-4')).toBe(true);
        expect(result.has('vendor/package-5')).toBe(true);

        // Verify https.get was called 3 times (once per page)
        expect(https.get).toHaveBeenCalledTimes(3);
      });

      it('should stop pagination when next is undefined', async () => {
        const page1 = {
          results: [
            { name: 'vendor/package-1' }
          ],
          total: 1
          // next is undefined (not present)
        };

        createMockResponse(page1);

        const result = await packagist.fetchPackagistList('vendor');

        expect(result.size).toBe(1);
        expect(https.get).toHaveBeenCalledTimes(1);
      });

      it('should use cache on subsequent calls', async () => {
        const mockData = {
          results: [
            { name: 'cached-vendor/package-a' }
          ],
          total: 1,
          next: null
        };

        createMockResponse(mockData);

        // First call - should make HTTP request
        const result1 = await packagist.fetchPackagistList('cached-vendor');

        // Second call - should use cache
        const result2 = await packagist.fetchPackagistList('cached-vendor');

        // Both should return the same Set reference
        expect(result1).toBe(result2);

        // HTTP request should only be made once
        expect(https.get).toHaveBeenCalledTimes(1);

        // Verify content is correct
        expect(result1.has('cached-vendor/package-a')).toBe(true);
      });

      it('should make correct API request with encoded vendor', async () => {
        const mockData = {
          results: [],
          total: 0,
          next: null
        };

        createMockResponse(mockData);

        await packagist.fetchPackagistList('mage-os');

        expect(https.get).toHaveBeenCalledWith(
          'https://packagist.org/search.json?per_page=100&q=mage-os%2F',
          expect.any(Function)
        );
      });
    });

    describe('edge cases', () => {
      it('should handle empty results array', async () => {
        const mockData = {
          results: [],
          total: 0
        };

        createMockResponse(mockData);

        const result = await packagist.fetchPackagistList('empty-vendor');

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
      });

      it('should filter out packages that do not match vendor prefix exactly', async () => {
        const mockData = {
          results: [
            { name: 'vendor/package' },           // Should be included
            { name: 'vendor-extra/package' },     // Should be excluded (different vendor)
            { name: 'vendor-other/package' },     // Should be excluded
            { name: 'vendorx/package' },          // Should be excluded (no slash separator match)
            { name: 'vendor/another-package' }    // Should be included
          ],
          total: 5,
          next: null
        };

        createMockResponse(mockData);

        const result = await packagist.fetchPackagistList('vendor');

        expect(result.size).toBe(2);
        expect(result.has('vendor/package')).toBe(true);
        expect(result.has('vendor/another-package')).toBe(true);
        expect(result.has('vendor-extra/package')).toBe(false);
        expect(result.has('vendor-other/package')).toBe(false);
        expect(result.has('vendorx/package')).toBe(false);
      });

      it('should skip results with missing name property', async () => {
        const mockData = {
          results: [
            { name: 'vendor/package-with-name' },
            { description: 'Package without name' },  // No name property
            { name: null },                           // Null name
            { name: '' },                             // Empty string name (will not match prefix)
            { name: 'vendor/another-package' }
          ],
          total: 5,
          next: null
        };

        createMockResponse(mockData);

        const result = await packagist.fetchPackagistList('vendor');

        // Only packages with valid names that match the vendor prefix should be included
        expect(result.size).toBe(2);
        expect(result.has('vendor/package-with-name')).toBe(true);
        expect(result.has('vendor/another-package')).toBe(true);
      });

      it('should handle response without results property', async () => {
        const mockData = {
          // No results property
          total: 0
        };

        createMockResponse(mockData);

        const result = await packagist.fetchPackagistList('no-results-vendor');

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
      });

      it('should handle response with null results', async () => {
        const mockData = {
          results: null,
          total: 0
        };

        createMockResponse(mockData);

        const result = await packagist.fetchPackagistList('null-results-vendor');

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
      });

      it('should handle completely empty response object', async () => {
        const mockData = {};

        createMockResponse(mockData);

        const result = await packagist.fetchPackagistList('empty-response-vendor');

        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
      });

      it('should cache different vendors separately', async () => {
        const vendor1Data = {
          results: [{ name: 'vendor1/package' }],
          total: 1,
          next: null
        };

        const vendor2Data = {
          results: [{ name: 'vendor2/package' }],
          total: 1,
          next: null
        };

        createMockResponse(vendor1Data);
        createMockResponse(vendor2Data);

        const result1 = await packagist.fetchPackagistList('vendor1');
        const result2 = await packagist.fetchPackagistList('vendor2');

        expect(result1.has('vendor1/package')).toBe(true);
        expect(result1.has('vendor2/package')).toBe(false);

        expect(result2.has('vendor2/package')).toBe(true);
        expect(result2.has('vendor1/package')).toBe(false);

        expect(https.get).toHaveBeenCalledTimes(2);
      });
    });

    describe('error handling', () => {
      it('should reject on network error', async () => {
        createMockResponse(null, true, 'Connection refused');

        await expect(packagist.fetchPackagistList('error-vendor'))
          .rejects
          .toThrow('Connection refused');
      });

      it('should reject on invalid JSON response', async () => {
        createMockInvalidJsonResponse();

        await expect(packagist.fetchPackagistList('invalid-json-vendor'))
          .rejects
          .toThrow();
      });

      it('should reject with SyntaxError on malformed JSON', async () => {
        createMockInvalidJsonResponse();

        await expect(packagist.fetchPackagistList('malformed-json-vendor'))
          .rejects
          .toBeInstanceOf(SyntaxError);
      });
    });
  });

  describe('isOnPackagist', () => {
    describe('with cache loaded', () => {
      beforeEach(async () => {
        // Set up mock response and load cache
        const mockData = {
          results: [
            { name: 'test-vendor/existing-package' },
            { name: 'test-vendor/another-package' }
          ],
          total: 2,
          next: null
        };

        createMockResponse(mockData);
        await packagist.fetchPackagistList('test-vendor');
      });

      it('should return true for existing package', () => {
        const result = packagist.isOnPackagist('test-vendor', 'test-vendor/existing-package');
        expect(result).toBe(true);
      });

      it('should return true for another existing package', () => {
        const result = packagist.isOnPackagist('test-vendor', 'test-vendor/another-package');
        expect(result).toBe(true);
      });

      it('should return false for non-existing package', () => {
        const result = packagist.isOnPackagist('test-vendor', 'test-vendor/non-existing');
        expect(result).toBe(false);
      });

      it('should return false for package from different vendor', () => {
        const result = packagist.isOnPackagist('test-vendor', 'other-vendor/package');
        expect(result).toBe(false);
      });
    });

    describe('special cases', () => {
      it('should always return false for magento vendor', () => {
        // Should not require cache to be loaded for magento vendor
        const result = packagist.isOnPackagist('magento', 'magento/any-package');
        expect(result).toBe(false);
      });

      it('should return false for magento vendor with any package name', () => {
        expect(packagist.isOnPackagist('magento', 'magento/module-catalog')).toBe(false);
        expect(packagist.isOnPackagist('magento', 'magento/framework')).toBe(false);
        expect(packagist.isOnPackagist('magento', 'magento/product-community-edition')).toBe(false);
      });

      it('should not make HTTP requests for magento vendor check', () => {
        packagist.isOnPackagist('magento', 'magento/something');
        expect(https.get).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should throw error when cache not loaded for vendor', () => {
        expect(() => {
          packagist.isOnPackagist('unloaded-vendor', 'unloaded-vendor/package');
        }).toThrow('Package list for vendor unloaded-vendor not loaded. Call fetchPackagistList(vendor) first.');
      });

      it('should throw error with correct vendor name in message', () => {
        expect(() => {
          packagist.isOnPackagist('my-special-vendor', 'my-special-vendor/pkg');
        }).toThrow(/my-special-vendor/);
      });

      it('should not throw for magento even when cache not loaded', () => {
        expect(() => {
          packagist.isOnPackagist('magento', 'magento/package');
        }).not.toThrow();
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete workflow: fetch list then check packages', async () => {
      const mockData = {
        results: [
          { name: 'workflow-vendor/package-a' },
          { name: 'workflow-vendor/package-b' }
        ],
        total: 2,
        next: null
      };

      createMockResponse(mockData);

      // First, fetch the list
      const packages = await packagist.fetchPackagistList('workflow-vendor');

      // Then check specific packages
      expect(packagist.isOnPackagist('workflow-vendor', 'workflow-vendor/package-a')).toBe(true);
      expect(packagist.isOnPackagist('workflow-vendor', 'workflow-vendor/package-b')).toBe(true);
      expect(packagist.isOnPackagist('workflow-vendor', 'workflow-vendor/package-c')).toBe(false);

      // Verify only one HTTP request was made
      expect(https.get).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple vendors independently', async () => {
      const vendor1Data = {
        results: [{ name: 'vendor-one/package' }],
        total: 1,
        next: null
      };

      const vendor2Data = {
        results: [{ name: 'vendor-two/different-package' }],
        total: 1,
        next: null
      };

      createMockResponse(vendor1Data);
      createMockResponse(vendor2Data);

      await packagist.fetchPackagistList('vendor-one');
      await packagist.fetchPackagistList('vendor-two');

      expect(packagist.isOnPackagist('vendor-one', 'vendor-one/package')).toBe(true);
      expect(packagist.isOnPackagist('vendor-two', 'vendor-two/different-package')).toBe(true);

      // Cross-vendor checks should return false
      expect(packagist.isOnPackagist('vendor-one', 'vendor-two/different-package')).toBe(false);
      expect(packagist.isOnPackagist('vendor-two', 'vendor-one/package')).toBe(false);
    });

    it('should handle large paginated results correctly', async () => {
      // Simulate 250 packages across 3 pages
      const page1Results = Array.from({ length: 100 }, (_, i) => ({
        name: `large-vendor/package-${i + 1}`
      }));

      const page2Results = Array.from({ length: 100 }, (_, i) => ({
        name: `large-vendor/package-${i + 101}`
      }));

      const page3Results = Array.from({ length: 50 }, (_, i) => ({
        name: `large-vendor/package-${i + 201}`
      }));

      setupPaginatedResponses([
        {
          results: page1Results,
          total: 250,
          next: 'https://packagist.org/search.json?q=large-vendor/&page=2'
        },
        {
          results: page2Results,
          total: 250,
          next: 'https://packagist.org/search.json?q=large-vendor/&page=3'
        },
        {
          results: page3Results,
          total: 250,
          next: null
        }
      ]);

      const result = await packagist.fetchPackagistList('large-vendor');

      expect(result.size).toBe(250);
      expect(result.has('large-vendor/package-1')).toBe(true);
      expect(result.has('large-vendor/package-100')).toBe(true);
      expect(result.has('large-vendor/package-101')).toBe(true);
      expect(result.has('large-vendor/package-200')).toBe(true);
      expect(result.has('large-vendor/package-201')).toBe(true);
      expect(result.has('large-vendor/package-250')).toBe(true);
      expect(result.has('large-vendor/package-251')).toBe(false);
    });
  });
});
