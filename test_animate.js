const airportCoords = {
    'JFK': [-73.7781, 40.6413], 'LHR': [-0.4543, 51.4700], 'HND': [139.7811, 35.5494],
    'CDG': [2.5479, 49.0097], 'FRA': [8.5706, 50.0379], 'DXB': [55.3644, 25.2532],
    'LAX': [-118.4085, 33.9416], 'YYZ': [-79.6248, 43.6777], 'AMS': [4.7683, 52.3105],
    'SYD': [151.1772, -33.9399], 'SIN': [103.9915, 1.3644]
};
const airports = Object.keys(airportCoords);

let liveFlightsData = [];
for (let i = 0; i < 150; i++) {
    let origin = airports[Math.floor(Math.random() * airports.length)];
    let dest = airports[Math.floor(Math.random() * airports.length)];
    if(origin === dest) dest = 'SIN';

    const originCoord = airportCoords[origin];
    const destCoord = airportCoords[dest];

    const progress = 10 + Math.random() * 80;
    const t = progress / 100;
    
    let dx = destCoord[0] - originCoord[0];
    if (dx > 180) dx -= 360;
    else if (dx < -180) dx += 360;
    const dy = destCoord[1] - originCoord[1];

    let lng = originCoord[0] + dx * t;
    if (lng > 180) lng -= 360;
    if (lng < -180) lng += 360;
    const lat = originCoord[1] + dy * t;

    let heading = Math.atan2(dx, dy) * (180 / Math.PI);
    if (heading < 0) heading += 360;

    const alt = 8000 + Math.random() * 4000;
    const velocity = 200 + Math.random() * 100;

    liveFlightsData.push({
        id: `live_mock_${i}`, lng, lat, alt, velocity, heading
    });
}

// simulate animation
let dt = 0.016; // 60fps
for(let step=0; step<100; step++) {
    liveFlightsData.forEach(f => {
        const speedDegreesPerSecond = (f.velocity / 111000); 
        const rad = (90 - f.heading) * (Math.PI / 180);
        f.lng += Math.cos(rad) * speedDegreesPerSecond * dt;
        f.lat += Math.sin(rad) * speedDegreesPerSecond * dt;
    });
}

const bad = liveFlightsData.filter(f => isNaN(f.lng) || isNaN(f.lat) || isNaN(f.heading));
console.log("Bad flights count:", bad.length);
if (bad.length > 0) {
    console.log(bad[0]);
} else {
    console.log("First flight:", liveFlightsData[0]);
}
