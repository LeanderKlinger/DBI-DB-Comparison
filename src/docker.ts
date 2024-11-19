const { exec } = require("child_process");

function runCommand(cmd: string) {
	return new Promise<string>((resolve, reject) => {
		exec(cmd, (error: any, stdout: any, stderr: any) => {
			if (error) {
				console.error(`[ERROR] ${stderr}`)
				reject()
				return;
			}

			if (stderr) {
				console.error(`[ERROR] ${stderr}`)
				reject()
				return;
			}

			// console.log(stdout)
			resolve(stdout)
		});
	})
}

let containers: string[] = []

export async function setupDocker() {
	containers.push(await runCommand('docker run -d -e POSTGRES_DB=mydb -e POSTGRES_PASSWORD=testpass123 -e POSTGRES_USER=postgres -p "6500:5432" postgres:17.0'))
	containers.push(await runCommand('docker run -d -p 27017:27017 -d mongodb/mongodb-community-server:latest'))

	console.log('[DEBUG] Started containers')

	await new Promise(resolve => setTimeout(resolve, 3000))

	await runCommand('bunx prisma migrate dev')

	console.log('[DEBUG] Migrated databse')
}

export async function cleanUpDocker() {
	console.log('[DEBUG] Cleaning up containers...')

	for (const id of containers) {
		await runCommand(`docker container stop ${id}`)
		await runCommand(`docker container rm ${id}`)
	}
}