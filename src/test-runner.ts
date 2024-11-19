import { cleanUpDocker, setupDocker,  } from './docker';
import { PerformanceTest } from './performance-test';
import { writeFileSync } from 'fs';

async function runAllTests() {
  const tester = new PerformanceTest();
  await tester.connect();

  const scales = [100, 1000] as const	// 30000
  const results: Record<number, any> = {};

  for (const scale of scales) {
    console.log(`\nRunning tests with scale: ${scale}`);
    results[scale] = await tester.runTests(scale);
	console.log(`[DEBUG] Finished scale ${scale}`)
  }

  // Save results to file
  writeFileSync('test-results.json', JSON.stringify(results, null, 2));
  
  console.log('[DEBUG] Disconnecting..')
  await tester.disconnect();
}

await setupDocker().catch(console.error)
await runAllTests().catch(console.error)
await cleanUpDocker().catch(console.error)