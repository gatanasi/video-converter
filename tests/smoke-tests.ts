#!/usr/bin/env tsx

/**
 * Smoke Tests for Video Converter Application
 * 
 * This script performs end-to-end smoke tests on the running Docker container.
 * It verifies that all API endpoints are accessible and return expected responses.
 * 
 * Test Coverage:
 * - Configuration endpoint
 * - File listing endpoints
 * - Conversion status endpoints (with mock data)
 * - Health check via config endpoint
 * - SSE stream connection
 */

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TIMEOUT = 10000; // 10 seconds timeout for requests

// Test Results
interface TestFailure {
  test: string;
  error: string;
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: TestFailure[] = [];

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
} as const;

/**
 * Makes an HTTP request with a configurable timeout.
 * 
 * @param {string} url - The URL to fetch.
 * @param {RequestInit} options - Optional fetch options (method, headers, body, etc.).
 * @param {number} timeout - Request timeout in milliseconds. Defaults to TIMEOUT constant.
 * @returns {Promise<Response>} The fetch Response object.
 * @throws {Error} Throws an error if the request times out or if the fetch fails.
 * 
 * The timeout behavior uses AbortController to cancel the request if it exceeds
 * the specified duration. This ensures requests don't hang indefinitely.
 */
async function fetchWithTimeout(
  url: string, 
  options: RequestInit = {}, 
  timeout: number = TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Log with color
 */
function log(message: string, color: string = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

/**
 * Runs a single test case, logs the result, and tracks test statistics.
 *
 * @param {string} testName - The name of the test to display in output and failure logs.
 * @param {() => Promise<void>} testFn - An async function containing the test logic. Should throw on failure.
 * @returns {Promise<boolean>} Resolves to true if the test passes, false if it fails.
 *
 * On failure, increments the failed test counter, logs the error, and records the failure details.
 * On success, increments the passed test counter and logs a success message.
 */
async function runTest(testName: string, testFn: () => Promise<void>): Promise<boolean> {
  totalTests++;
  process.stdout.write(`  ${colors.cyan}Testing:${colors.reset} ${testName}... `);
  
  try {
    await testFn();
    passedTests++;
    log('✓ PASS', colors.green);
    return true;
  } catch (error) {
    failedTests++;
    log('✗ FAIL', colors.red);
    const errorMessage = error instanceof Error ? error.message : String(error);
    failures.push({ test: testName, error: errorMessage });
    log(`    ${colors.red}Error: ${errorMessage}${colors.reset}`, colors.red);
    return false;
  }
}

/**
 * Assert function with TypeScript type narrowing.
 * 
 * @param {boolean} condition - The condition to assert.
 * @param {string} message - Optional error message to display if assertion fails.
 * @throws {Error} Throws an error if the condition is false.
 */
function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message ?? 'Assertion failed');
  }
}

/**
 * Test: GET /api/config
 */
async function testGetConfig(): Promise<void> {
  const response = await fetchWithTimeout(`${BASE_URL}/api/config`);
  assert(response.ok, `Expected 200, got ${response.status}`);
  
  const data = await response.json() as Record<string, unknown>;
  assert(typeof data === 'object', 'Response should be an object');
  assert('defaultDriveFolderId' in data, 'Response should contain defaultDriveFolderId');
}

/**
 * Test: GET /api/files
 */
async function testListFiles(): Promise<void> {
  const response = await fetchWithTimeout(`${BASE_URL}/api/files`);
  assert(response.ok, `Expected 200, got ${response.status}`);
  
  const data = await response.json();
  assert(Array.isArray(data), 'Response should be an array');
}

/**
 * Test: GET /api/conversions/active
 */
async function testActiveConversions(): Promise<void> {
  const response = await fetchWithTimeout(`${BASE_URL}/api/conversions/active`);
  assert(response.ok, `Expected 200, got ${response.status}`);
  
  const data = await response.json();
  assert(Array.isArray(data), 'Response should be an array');
}

/**
 * Test: GET /api/conversions/stream (SSE)
 */
async function testSSEStream(): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(`${BASE_URL}/api/conversions/stream`, {
      signal: controller.signal,
    });
    
    assert(response.ok, `Expected 200, got ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    assert(
      contentType.toLowerCase().startsWith('text/event-stream'),
      `Expected Content-Type to start with text/event-stream, received '${contentType}'`
    );
    
    // Successfully connected to SSE stream
    clearTimeout(timeout);
    controller.abort(); // Close connection
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      // Expected - we aborted after verifying connection
      return;
    }
    throw error;
  }
}

/**
 * Test: GET /api/conversion/status/:id (with non-existent ID)
 */
async function testConversionStatusNotFound(): Promise<void> {
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const response = await fetchWithTimeout(`${BASE_URL}/api/conversion/status/${fakeId}`);
  assert(response.status === 404, `Expected 404, got ${response.status}`);
}

/**
 * Test: POST /api/conversion/abort/:id (with non-existent ID)
 */
async function testAbortConversionNotFound(): Promise<void> {
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const response = await fetchWithTimeout(`${BASE_URL}/api/conversion/abort/${fakeId}`, {
    method: 'POST',
  });
  assert(response.status === 404, `Expected 404, got ${response.status}`);
}

/**
 * Test: DELETE /api/file/delete/:filename (with non-existent file)
 * Note: DELETE is idempotent - returns 200 even if file doesn't exist
 */
async function testDeleteFileNotFound(): Promise<void> {
  const fakeFilename = 'nonexistent-file-12345.mp4';
  const response = await fetchWithTimeout(`${BASE_URL}/api/file/delete/${fakeFilename}`, {
    method: 'DELETE',
  });
  // DELETE is idempotent - returns 200 even if file doesn't exist
  assert(response.ok, `Expected 200, got ${response.status}`);
  
  const data = await response.json() as { success?: boolean };
  assert(data.success === true, 'Response should indicate success');
}

/**
 * Test: GET /download/:filename (with non-existent file)
 */
async function testDownloadFileNotFound(): Promise<void> {
  const fakeFilename = 'nonexistent-file-12345.mp4';
  const response = await fetchWithTimeout(`${BASE_URL}/download/${fakeFilename}`);
  assert(response.status === 404, `Expected 404, got ${response.status}`);
}

/**
 * Test: POST /api/convert/drive (with missing parameters)
 */
async function testConvertDriveMissingParams(): Promise<void> {
  const response = await fetchWithTimeout(`${BASE_URL}/api/convert/drive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert(response.status === 400, `Expected 400, got ${response.status}`);
  
  const data = await response.json() as { error?: string };
  assert(!!data.error, 'Response should contain error message');
}

/**
 * Test: POST /api/convert/drive (with invalid format)
 */
async function testConvertDriveInvalidFormat(): Promise<void> {
  const response = await fetchWithTimeout(`${BASE_URL}/api/convert/drive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileId: 'test-file-id',
      fileName: 'test-video.mov',
      targetFormat: 'invalid-format',
    }),
  });
  assert(response.status === 400, `Expected 400, got ${response.status}`);
  
  const data = await response.json() as { error?: string };
  assert(!!data.error, 'Response should contain error message');
}

/**
 * Test: POST /api/convert/upload (with missing file)
 */
async function testUploadConvertMissingFile(): Promise<void> {
  const formData = new FormData();
  formData.set('targetFormat', 'mp4');

  const response = await fetchWithTimeout(`${BASE_URL}/api/convert/upload`, {
    method: 'POST',
    body: formData,
  });
  assert(response.status === 400, `Expected 400, got ${response.status}`);
}

/**
 * Test: GET /api/videos/drive (with missing folderId)
 */
async function testListDriveVideosMissingFolderId(): Promise<void> {
  const response = await fetchWithTimeout(`${BASE_URL}/api/videos/drive`);
  assert(response.status === 400, `Expected 400, got ${response.status}`);
  
  const data = await response.json() as { error?: string };
  assert(!!data.error, 'Response should contain error message');
}

/**
 * Test: Method not allowed tests
 */
async function testMethodNotAllowed(): Promise<void> {
  // Test wrong method on config endpoint
  const response = await fetchWithTimeout(`${BASE_URL}/api/config`, {
    method: 'POST',
  });
  assert(response.status === 405, `Expected 405, got ${response.status}`);
}

/**
 * Test: Static file serving (index.html)
 */
async function testStaticFiles(): Promise<void> {
  const response = await fetchWithTimeout(`${BASE_URL}/`);
  assert(response.ok, `Expected 200, got ${response.status}`);
  
  const html = await response.text();
  assert(html.length > 0, 'Should return HTML content');
  assert(html.includes('<!DOCTYPE html>') || html.includes('<html'), 'Should be valid HTML');
}

/**
 * Test: Path traversal protection
 */
async function testPathTraversalProtection(): Promise<void> {
  // Test path traversal in the filename itself (these reach the handler)
  const maliciousFilenames = [
    'test..test',
    '..passwd',
    'file..mp4',
  ];
  
  for (const filename of maliciousFilenames) {
    const response = await fetchWithTimeout(`${BASE_URL}/api/file/delete/${filename}`, {
      method: 'DELETE',
    });
    // The backend detects ".." in filename and returns 400 Bad Request
    assert(response.status === 400, 
      `Path traversal protection failed for filename: ${filename} (expected: 400, got: ${response.status})`);
    
    const data = await response.json() as { error?: string };
    assert(!!data.error && data.error.includes('invalid'), 
      `Expected error message about invalid filename for: ${filename}`);
  }
  
  // Test path traversal with slashes (these also get caught)
  const pathsWithSlashes = [
    'subdir/file.mp4',
    '../file.mp4',
    'file\\test.mp4',
  ];
  
  for (const filename of pathsWithSlashes) {
    const response = await fetchWithTimeout(`${BASE_URL}/api/file/delete/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    });
    // The backend detects "/" or "\" in filename and returns 400 Bad Request
    assert(response.status === 400, 
      `Path traversal protection failed for filename with slashes: ${filename} (expected: 400, got: ${response.status})`);
    
    const data = await response.json() as { error?: string };
    assert(!!data.error && data.error.includes('invalid'), 
      `Expected error message about invalid filename for: ${filename}`);
  }
}

/**
 * Main test suite
 */
async function runSmokeTests(): Promise<void> {
  log(`\n${colors.bright}═══════════════════════════════════════════════════════`, colors.cyan);
  log(`  Video Converter - Smoke Tests`, colors.cyan);
  log(`═══════════════════════════════════════════════════════${colors.reset}`, colors.cyan);
  log(`Base URL: ${BASE_URL}\n`);

  try {
    log(`\n${colors.bright}Running Smoke Tests...${colors.reset}`, colors.cyan);
    log('─────────────────────────────────────────────────────\n');

    // Run all tests
    await runTest('GET /api/config', testGetConfig);
    await runTest('GET /api/files', testListFiles);
    await runTest('GET /api/conversions/active', testActiveConversions);
    await runTest('GET /api/conversions/stream (SSE)', testSSEStream);
    await runTest('GET /api/conversion/status/:id (not found)', testConversionStatusNotFound);
    await runTest('POST /api/conversion/abort/:id (not found)', testAbortConversionNotFound);
    await runTest('DELETE /api/file/delete/:filename (not found)', testDeleteFileNotFound);
    await runTest('GET /download/:filename (not found)', testDownloadFileNotFound);
    await runTest('POST /api/convert/drive (missing params)', testConvertDriveMissingParams);
    await runTest('POST /api/convert/drive (invalid format)', testConvertDriveInvalidFormat);
    await runTest('POST /api/convert/upload (missing file)', testUploadConvertMissingFile);
    await runTest('GET /api/videos/drive (missing folderId)', testListDriveVideosMissingFolderId);
    await runTest('Method not allowed (405)', testMethodNotAllowed);
    await runTest('GET / (static files)', testStaticFiles);
    await runTest('Path traversal protection', testPathTraversalProtection);

    // Print summary
    log('\n─────────────────────────────────────────────────────');
    log(`\n${colors.bright}Test Results:${colors.reset}`);
    log(`  Total:  ${totalTests}`);
    log(`  Passed: ${passedTests}`, colors.green);
    log(`  Failed: ${failedTests}`, failedTests > 0 ? colors.red : colors.reset);

    if (failures.length > 0) {
      log(`\n${colors.bright}Failures:${colors.reset}`, colors.red);
      failures.forEach(({ test, error }) => {
        log(`  ✗ ${test}`, colors.red);
        log(`    ${error}`, colors.red);
      });
    }

    log('\n═══════════════════════════════════════════════════════\n', colors.cyan);

    // Exit with appropriate code
    if (failedTests > 0) {
      process.exit(1);
    } else {
      log('All smoke tests passed! ✓', colors.green);
      process.exit(0);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`\n${colors.red}Fatal error: ${errorMessage}${colors.reset}`, colors.red);
    process.exit(1);
  }
}

// Run tests
runSmokeTests();
