import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { feature, mesh } from 'https://cdn.jsdelivr.net/npm/topojson-client@3/+esm';

async function loadData() {
  const data = await d3.csv('ghg_only_anomaly.csv', (row) => {
    let lon = +row.lon;

    if (lon > 180) {
      lon = lon - 360;
    }

    return {
      lat: +row.lat,
      lon,
      anomaly: +row.anomaly,
    };
  });

  return data;
}

const [data, world] = await Promise.all([
  loadData(),
  d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'),
]);

const countries = feature(world, world.objects.countries);
const countryBorders = mesh(world, world.objects.countries, (a, b) => a !== b);

const formatAnomaly = d3.format('+.2f');

const latData = d3.rollup(
  data,
  (v) => d3.mean(v, (d) => d.anomaly),
  (d) => d.lat
);

const latitudes = Array.from(latData, ([lat, avgAnomaly]) => ({
  lat,
  avgAnomaly,
})).sort((a, b) => d3.ascending(a.lat, b.lat));

/* ------------------------------------------------------
   Shared color scale
------------------------------------------------------ */

const colorScale = d3
  .scaleThreshold()
  .domain([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5])
  .range([
    '#2166ac', // < 0
    '#f7f7f7', // 0–0.5
    '#fee5d9', // 0.5–1
    '#fcbba1', // 1–1.5
    '#fc9272', // 1.5–2
    '#fb6a4a', // 2–2.5
    '#ef3b2c', // 2.5–3
    '#cb181d', // 3–3.5
    '#a50f15', // 3.5–4
    '#67000d', // 4–4.5
    '#3f0008', // > 4.5
  ]);

const legendData = [
  { label: '< 0 K', color: '#2166ac' },
  { label: '0–0.5 K', color: '#f7f7f7' },
  { label: '0.5–1 K', color: '#fee5d9' },
  { label: '1–1.5 K', color: '#fcbba1' },
  { label: '1.5–2 K', color: '#fc9272' },
  { label: '2–2.5 K', color: '#fb6a4a' },
  { label: '2.5–3 K', color: '#ef3b2c' },
  { label: '3–3.5 K', color: '#cb181d' },
  { label: '3.5–4 K', color: '#a50f15' },
  { label: '4–4.5 K', color: '#67000d' },
  { label: '> 4.5 K', color: '#3f0008' },
];

/* ------------------------------------------------------
   Global map
------------------------------------------------------ */

const mapWidth = 760;
const mapHeight = 430;
const mapMargin = { top: 20, right: 20, bottom: 35, left: 50 };

const mapSvg = d3
  .select('#map')
  .append('svg')
  .attr('viewBox', `0 0 ${mapWidth} ${mapHeight}`);

const projection = d3
  .geoEquirectangular()
  .fitExtent(
    [
      [mapMargin.left, mapMargin.top],
      [mapWidth - mapMargin.right, mapHeight - mapMargin.bottom],
    ],
    { type: 'Sphere' }
  );

const path = d3.geoPath(projection);

const xScale = d3
  .scaleLinear()
  .domain([-180, 180])
  .range([projection([-180, 0])[0], projection([180, 0])[0]]);

const yScale = d3
  .scaleLinear()
  .domain([90, -90])
  .range([projection([0, 90])[1], projection([0, -90])[1]]);

const uniqueLons = Array.from(new Set(data.map((d) => d.lon))).sort(d3.ascending);
const uniqueLats = Array.from(new Set(data.map((d) => d.lat))).sort(d3.ascending);

const lonStep = Math.abs(uniqueLons[1] - uniqueLons[0]);
const latStep = Math.abs(uniqueLats[1] - uniqueLats[0]);

const topLeft = projection([data[0].lon - lonStep / 2, data[0].lat + latStep / 2]);
const topRight = projection([data[0].lon + lonStep / 2, data[0].lat + latStep / 2]);
const bottomLeft = projection([data[0].lon - lonStep / 2, data[0].lat - latStep / 2]);

const cellW = Math.abs(topRight[0] - topLeft[0]) + 0.3;
const cellH = Math.abs(bottomLeft[1] - topLeft[1]) + 0.3;

// Background ocean rectangle.
mapSvg
  .append('rect')
  .attr('x', mapMargin.left)
  .attr('y', mapMargin.top)
  .attr('width', mapWidth - mapMargin.left - mapMargin.right)
  .attr('height', mapHeight - mapMargin.top - mapMargin.bottom)
  .attr('fill', '#eef3f7');

// Temperature anomaly grid.
const mapCells = mapSvg
  .append('g')
  .selectAll('rect')
  .data(data)
  .join('rect')
  .attr('x', (d) => projection([d.lon - lonStep / 2, d.lat + latStep / 2])[0])
  .attr('y', (d) => projection([d.lon - lonStep / 2, d.lat + latStep / 2])[1])
  .attr('width', cellW)
  .attr('height', cellH)
  .attr('fill', (d) => colorScale(d.anomaly))
  .attr('opacity', 0.88);

// Country outlines.
mapSvg
  .append('path')
  .datum(countries)
  .attr('d', path)
  .attr('fill', 'none')
  .attr('stroke', '#333')
  .attr('stroke-width', 0.45)
  .attr('opacity', 0.85)
  .attr('pointer-events', 'none');

mapSvg
  .append('path')
  .datum(countryBorders)
  .attr('d', path)
  .attr('fill', 'none')
  .attr('stroke', '#333')
  .attr('stroke-width', 0.35)
  .attr('opacity', 0.75)
  .attr('pointer-events', 'none');

// One moving hover box only.
const hoverBox = mapSvg
  .append('rect')
  .attr('fill', 'none')
  .attr('stroke', '#111')
  .attr('stroke-width', 1.5)
  .attr('pointer-events', 'none')
  .attr('opacity', 0);

// Axes.
mapSvg
  .append('g')
  .attr('transform', `translate(0, ${mapHeight - mapMargin.bottom})`)
  .call(d3.axisBottom(xScale).ticks(7));

mapSvg
  .append('g')
  .attr('transform', `translate(${mapMargin.left}, 0)`)
  .call(d3.axisLeft(yScale).ticks(7).tickFormat((d) => `${d}°`));

mapSvg
  .append('text')
  .attr('x', mapWidth / 2)
  .attr('y', mapHeight - 3)
  .attr('text-anchor', 'middle')
  .attr('font-size', 12)
  .text('Longitude');

mapSvg
  .append('text')
  .attr('transform', 'rotate(-90)')
  .attr('x', -mapHeight / 2)
  .attr('y', 15)
  .attr('text-anchor', 'middle')
  .attr('font-size', 12)
  .text('Latitude');

// Legend below the map, not on top of the data.
const legend = d3
  .select('#map')
  .append('div')
  .attr('class', 'map-legend');

legend.append('strong').text('Temperature anomaly bins:');

const legendItems = legend
  .selectAll('span.legend-item')
  .data(legendData)
  .join('span')
  .attr('class', 'legend-item');

legendItems
  .append('span')
  .attr('class', 'legend-swatch')
  .style('background', (d) => d.color);

legendItems.append('span').text((d) => d.label);

/* ------------------------------------------------------
   Linked latitude chart
------------------------------------------------------ */

const chartWidth = 360;
const chartHeight = 430;
const chartMargin = { top: 50, right: 25, bottom: 55, left: 60 };

const chartSvg = d3
  .select('#latitude-chart')
  .append('svg')
  .attr('viewBox', `0 0 ${chartWidth} ${chartHeight}`);

const chartX = d3
  .scaleLinear()
  .domain(d3.extent(data, (d) => d.anomaly))
  .nice()
  .range([chartMargin.left, chartWidth - chartMargin.right]);

const chartY = d3
  .scaleLinear()
  .domain([90, -90])
  .range([chartMargin.top, chartHeight - chartMargin.bottom]);

chartSvg
  .append('g')
  .attr('transform', `translate(0, ${chartHeight - chartMargin.bottom})`)
  .call(d3.axisBottom(chartX).ticks(5));

chartSvg
  .append('g')
  .attr('transform', `translate(${chartMargin.left}, 0)`)
  .call(d3.axisLeft(chartY).ticks(7).tickFormat((d) => `${d}°`));

chartSvg
  .append('text')
  .attr('x', chartWidth / 2)
  .attr('y', chartHeight - 10)
  .attr('text-anchor', 'middle')
  .attr('font-size', 12)
  .text('Temperature anomaly (K)');

chartSvg
  .append('text')
  .attr('transform', 'rotate(-90)')
  .attr('x', -chartHeight / 2)
  .attr('y', 16)
  .attr('text-anchor', 'middle')
  .attr('font-size', 12)
  .text('Latitude');

chartSvg
  .append('text')
  .attr('x', chartMargin.left)
  .attr('y', 22)
  .attr('font-size', 12)
  .attr('font-weight', 'bold')
  .text('Average anomaly by latitude');

const line = d3
  .line()
  .x((d) => chartX(d.avgAnomaly))
  .y((d) => chartY(d.lat))
  .curve(d3.curveBasis);

chartSvg
  .append('path')
  .datum(latitudes)
  .attr('fill', 'none')
  .attr('stroke', '#333')
  .attr('stroke-width', 2.5)
  .attr('d', line);

const highlightLine = chartSvg
  .append('line')
  .attr('x1', chartMargin.left)
  .attr('x2', chartWidth - chartMargin.right)
  .attr('stroke', '#333')
  .attr('stroke-width', 1.2)
  .attr('stroke-dasharray', '4,4')
  .attr('opacity', 0);

const avgDot = chartSvg
  .append('circle')
  .attr('r', 5)
  .attr('fill', '#333')
  .attr('opacity', 0);

const localDot = chartSvg
  .append('circle')
  .attr('r', 5)
  .attr('fill', '#b2182b')
  .attr('stroke', 'white')
  .attr('stroke-width', 1)
  .attr('opacity', 0);

const hoverText1 = chartSvg
  .append('text')
  .attr('x', chartMargin.left)
  .attr('y', 38)
  .attr('font-size', 11)
  .attr('opacity', 0);

const hoverText2 = chartSvg
  .append('text')
  .attr('x', chartMargin.left)
  .attr('y', 52)
  .attr('font-size', 11)
  .attr('opacity', 0);

/* ------------------------------------------------------
   Interaction
------------------------------------------------------ */

const tooltip = d3.select('#tooltip');

mapCells
  .on('mouseover', (event, d) => {
    const hoveredLatAvg = latData.get(d.lat);
    const difference = d.anomaly - hoveredLatAvg;

    tooltip
      .property('hidden', false)
      .html(`
        <strong>Hovered location</strong><br>
        Latitude: ${d.lat.toFixed(1)}°<br>
        Longitude: ${d.lon.toFixed(1)}°<br>
        Local anomaly: ${formatAnomaly(d.anomaly)} K<br>
        Latitude average: ${formatAnomaly(hoveredLatAvg)} K<br>
        Difference from latitude avg: ${formatAnomaly(difference)} K
      `);

    hoverBox
      .attr('x', projection([d.lon - lonStep / 2, d.lat + latStep / 2])[0])
      .attr('y', projection([d.lon - lonStep / 2, d.lat + latStep / 2])[1])
      .attr('width', cellW)
      .attr('height', cellH)
      .attr('opacity', 1);

    highlightLine
      .attr('y1', chartY(d.lat))
      .attr('y2', chartY(d.lat))
      .attr('opacity', 1);

    avgDot
      .attr('cx', chartX(hoveredLatAvg))
      .attr('cy', chartY(d.lat))
      .attr('opacity', 1);

    localDot
      .attr('cx', chartX(d.anomaly))
      .attr('cy', chartY(d.lat))
      .attr('opacity', 1);

    hoverText1
      .attr('opacity', 1)
      .text(`Selected latitude: ${d.lat.toFixed(1)}°`);

    hoverText2
      .attr('opacity', 1)
      .text(
        `Local ${formatAnomaly(d.anomaly)} K vs. latitude avg ${formatAnomaly(
          hoveredLatAvg
        )} K`
      );
  })
  .on('mousemove', (event) => {
    tooltip
      .style('left', `${event.clientX + 15}px`)
      .style('top', `${event.clientY + 15}px`);
  })
  .on('mouseout', () => {
    tooltip.property('hidden', true);

    hoverBox.attr('opacity', 0);
    highlightLine.attr('opacity', 0);
    avgDot.attr('opacity', 0);
    localDot.attr('opacity', 0);
    hoverText1.attr('opacity', 0);
    hoverText2.attr('opacity', 0);
  });