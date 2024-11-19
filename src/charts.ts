import { readFileSync, writeFileSync } from 'fs';

export function generateChart(data: any, scale: string, withAtlas: boolean) {
	const html = `<!DOCTYPE html>
	<html>
	<body style="padding: 32px;">
	<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
	<canvas id="chart"></canvas>
	<script>
		const ctx = document.getElementById('chart');
		new Chart(ctx, {
			type: 'bar',
			data: {
				labels: ['Writes', 'Simple Read', 'Filtered Read', 'Projected Read', 'Sorted Read', 'Update', 'Delete'],
				datasets: [
					{
						label: "Postgres",
						fillColor: "blue",
						data: [${data[scale]['postgres']['writes']}, ${data[scale]['postgres']['simpleRead']}, ${data[scale]['postgres']['filteredRead']}, ${data[scale]['postgres']['projectedRead']}, ${data[scale]['postgres']['sortedRead']}, ${data[scale]['postgres']['update']}, ${data[scale]['postgres']['delete']}]
					},
					{
						label: "MongoDB",
						fillColor: "green",
						data: [${data[scale]['mongo']['writes']}, ${data[scale]['mongo']['simpleRead']}, ${data[scale]['mongo']['filteredRead']}, ${data[scale]['mongo']['projectedRead']}, ${data[scale]['mongo']['sortedRead']}, ${data[scale]['mongo']['update']}, ${data[scale]['mongo']['delete']}]
					},
					${withAtlas ? JSON.stringify({
						label: "MongoDB Atlas",
						fillColor: "red",
						data: [data[scale]['atlas']['writes'], data[scale]['atlas']['simpleRead'], data[scale]['atlas']['filteredRead'], data[scale]['atlas']['projectedRead'], data[scale]['atlas']['sortedRead'], data[scale]['atlas']['update'], data[scale]['atlas']['delete']]
					}) : ""}
				]
			},
			options: {
				scales: { y: { beginAtZero: true } },
				animation: { duration: 0 },
			}
		});
	</script>
	</body></html>`


	writeFileSync(`charts_${scale}.html`, html)
}

const data = JSON.parse(readFileSync('test-results.json', 'utf8'))

generateChart(data, '100', false)
generateChart(data, '1000', false)