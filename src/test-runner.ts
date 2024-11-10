import { PerformanceTest } from './performance-test';
import { writeFileSync } from 'fs';

async function runAllTests() {
  const tester = new PerformanceTest();
  await tester.connect();

  const scales = [100, 1000, 30000] as const;
  const results: Record<number, any> = {};

  for (const scale of scales) {
    console.log(`\nRunning tests with scale: ${scale}`);
    results[scale] = await tester.runTests(scale);
  }

  // Save results to file
  writeFileSync('test-results.json', JSON.stringify(results, null, 2));
  
  await tester.disconnect();
}

runAllTests().catch(console.error);
