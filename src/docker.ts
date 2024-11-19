import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function setupDocker() {
  try {
    // Kill any existing containers using the ports
    await execAsync('docker kill $(docker ps -q)').catch(() => {});
    await execAsync('docker rm $(docker ps -a -q)').catch(() => {});
    
    // Wait a moment for ports to be released
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start containers with different port mappings
    await execAsync('docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres');
    await execAsync('docker run -d -p 27017:27017 mongo');
    
    // Wait for containers to be ready
    await new Promise(resolve => setTimeout(resolve, 5000));
  } catch (error) {
    console.error('[ERROR] Docker setup failed:', error);
    throw error;
  }
}

export async function cleanUpDocker() {
  try {
    await execAsync('docker kill $(docker ps -q)');
    await execAsync('docker rm $(docker ps -a -q)');
  } catch (error) {
    console.error('[ERROR] Docker cleanup failed:', error);
  }
}