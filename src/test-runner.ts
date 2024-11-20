import { cleanUpDocker, setupDocker } from './docker';
import { PerformanceTest } from './performance-test';
import { writeFileSync } from 'fs';
import Table from 'cli-table3';


async function runAllTests() {
  console.log('[DEBUG] Setting up test environment...');
  
  try {
    const tester = new PerformanceTest();
    await tester.connect();

    const scales = [100, 1000] as const;  // 30000
    const results: Record<number, any> = {};

    // Run scale tests
    for (const scale of scales) {
      console.log(`\n[INFO] Running tests with scale: ${scale}`);
      results[scale] = await tester.runTests(scale);
      console.log(`[DEBUG] Finished scale ${scale}`);
    }

    // Run aggregation tests at scale 1000
    console.log('\n[INFO] Running aggregation tests...');
    const aggResults = await tester.runAggregationTests();
    
    // Format aggregation results
    const aggTable = new Table({
      head: ['Operation', 'Postgres', 'MongoDB'],
      style: {
        head: ['cyan'],
        border: ['gray']
      }
    });

    Object.keys(aggResults.postgres).forEach(op => {
      aggTable.push([
        op,
        `${(aggResults as any).postgres[op].toFixed(2)}ms`,
        `${(aggResults as any).mongo[op].toFixed(2)}ms`
      ]);
    });

    console.log('\n=== Aggregation Tests Results (Scale: 1000) ===');
    console.log(aggTable.toString());

    // Save all results
    const fullResults = {
      scaleTests: results,
      aggregationTests: aggResults
    };
    
    writeFileSync('test-results.json', JSON.stringify(fullResults, null, 2));
    
    console.log('[DEBUG] Disconnecting...');
    await tester.disconnect();
  } catch (error) {
    console.error('[ERROR] Test execution failed:', error);
    throw error;
  }
}

// Main execution
await setupDocker().catch(console.error);
await runAllTests().catch(console.error);
await cleanUpDocker().catch(console.error);