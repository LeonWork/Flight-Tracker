/* global maplibregl, THREE */
// Global THREE and maplibregl are available via index.html script tags

// Elements
const mapContainer = document.getElementById('map');
const loadingOverlay = document.getElementById('loading');
const flightPanel = document.getElementById('flightPanel');
const closePanelBtn = document.getElementById('closePanel');
const flightInfoContent = document.getElementById('flightInfoContent');
const searchBtn = document.getElementById('searchBtn');
const routeSearch = document.getElementById('routeSearch');
const statusText = document.getElementById('statusText');
const pulseIndicator = document.getElementById('pulseIndicator');
const liveTrafficToggle = document.getElementById('liveTrafficToggle');

let isMockMode = false;
let mockFlightsData = [];
let liveFlightsData = []; // Store the flight data objects to animate them
let followMode = 'none'; // 'none', 'map', '3d'
let isTransitioning = false; // Prevents camera animation loop from interrupting manual flyTo commands
let isUserZooming = false;

function getCurvePosition(start, end, t) {
    let dx = end[0] - start[0];
    if (dx > 180) dx -= 360;
    else if (dx < -180) dx += 360;
    
    let lng = start[0] + dx * t;
    if (lng > 180) lng -= 360;
    if (lng < -180) lng += 360;
    
    let lat = start[1] + (end[1] - start[1]) * t;
    
    const dist = Math.sqrt(dx*dx + Math.pow(end[1]-start[1], 2));
    const curveHeight = dist * 0.2; 
    
    let offset = Math.sin(t * Math.PI) * curveHeight;
    const avgLat = (start[1] + end[1]) / 2;
    if (avgLat < 0) offset = -offset; // arc towards pole
    
    lat += offset;
    
    return [lng, lat];
}

// Initialize MapLibre Map (Using Carto Dark Matter style for a premium dark look)
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [0, 20], // Centered globally
    zoom: 2, // Fully zoomed out initially
    pitch: 0, 
    maxPitch: 85, // Allow steep camera angles for 3D follow cam
    bearing: 0,
    antialias: true
});

map.on('zoomstart', () => isUserZooming = true);
map.on('zoomend', () => isUserZooming = false);

// Cancel follow mode if user manually pans the map
map.on('dragstart', () => {
    if (followMode !== 'none') {
        followMode = 'none';
        const mapBtn = document.getElementById('followMapBtn');
        const camBtn = document.getElementById('followCamBtn');
        if (mapBtn) {
            mapBtn.innerText = 'Follow (Map)';
            mapBtn.style.background = 'var(--bg-dark)';
            mapBtn.style.color = 'var(--primary-color)';
        }
        if (camBtn) {
            camBtn.innerText = 'Follow (3D)';
            camBtn.style.background = 'var(--primary-color)';
        }
        
        // Ensure 2D marker comes back if they pan away during 3D follow
        for (const id in markers) {
            const isHidden = selectedFlightId !== null && id !== selectedFlightId;
            markers[id].getElement().style.display = isHidden ? 'none' : 'block';
        }
    }
});

// Make Map visually pleasing with dynamic styling for deep blue oceans and sleek landmasses
map.on('style.load', () => {
    const layers = map.getStyle().layers;
    layers.forEach(layer => {
        // Deep blue ocean/background
        if (layer.type === 'background') {
            map.setPaintProperty(layer.id, 'background-color', '#020d1a');
        }
        if (layer.id.toLowerCase().includes('water') && layer.type === 'fill') {
            map.setPaintProperty(layer.id, 'fill-color', '#004b87'); // Brighter, rich blue ocean
        }
        // Slate/dark teal landmasses
        if ((layer.id.toLowerCase().includes('land') || layer.id.toLowerCase().includes('earth') || layer.id.toLowerCase().includes('base')) && layer.type === 'fill') {
            map.setPaintProperty(layer.id, 'fill-color', '#131e32'); // Sleek, appealing land color
        }
    });
});

// Map control
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

// Store markers
const markers = {};
let selectedFlightId = null;

// The 3D Custom Layer for the selected plane
let customModelLayer = null;

map.on('load', () => {
    loadingOverlay.classList.add('hidden');
    
    // (Removed 3d-buildings as it requires a specific vector source not present in basic Carto style)

    // Start fetching flights
    fetchFlights();
    setInterval(fetchFlights, 10000); // Update every 10 seconds
});

async function fetchFlights() {
    try {
        if (isMockMode) return; // Don't overwrite route search flights
        
        if (liveFlightsData.length > 0) return; // Prevent teleporting mock planes every 10 seconds
        
        const airportCoords = {
            'JFK': [-73.7781, 40.6413], 'LHR': [-0.4543, 51.4700], 'HND': [139.7811, 35.5494],
            'CDG': [2.5479, 49.0097], 'FRA': [8.5706, 50.0379], 'DXB': [55.3644, 25.2532],
            'LAX': [-118.4085, 33.9416], 'YYZ': [-79.6248, 43.6777], 'AMS': [4.7683, 52.3105],
            'SYD': [151.1772, -33.9399], 'SIN': [103.9915, 1.3644]
        };
        const airports = Object.keys(airportCoords);

        // Generate 150 mock live flights spread globally
        liveFlightsData = [];
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
            const velocity = 200 + Math.random() * 100; // m/s
            const callsign = 'FLT' + Math.floor(Math.random() * 9000 + 1000);
            const countries = ['United States', 'Canada', 'Germany', 'France', 'United Kingdom', 'Italy', 'Spain', 'Japan', 'Australia', 'Brazil', 'UAE', 'Singapore'];
            const country = countries[Math.floor(Math.random() * countries.length)];
            
            const durationMins = 60 + Math.floor(Math.random() * 300);
            const timeLeft = Math.floor(durationMins * ((100 - progress) / 100));

            liveFlightsData.push({
                id: `live_mock_${i}`, callsign, country, lng, lat, alt, velocity, heading,
                origin, dest, originCoord, destCoord, progress,
                depTime: 'In Air', arrTime: `${Math.floor(timeLeft/60)}h ${timeLeft%60}m left`
            });
        }

        if (liveTrafficToggle.checked) {
            updateMapMarkers(liveFlightsData, false);
            statusText.innerText = "System Active";
            pulseIndicator.style.backgroundColor = "#00ff88";
            pulseIndicator.style.boxShadow = "0 0 12px #00ff88";
        }
        
        // Ensure overlay is hidden if it hasn't been already
        loadingOverlay.classList.add('hidden');
        
        if (!window.isAnimating) {
            window.isAnimating = true;
            animateFlights();
        }
        
    } catch (err) {
        console.error('Error generating mock flights:', err);
    }
}

function updateMapMarkers(flights, isRouteSearch) {
    const currentFlightIds = new Set(flights.map(f => f.id));

    // Remove old markers
    for (const id in markers) {
        if (!currentFlightIds.has(id)) {
            markers[id].remove();
            delete markers[id];
        }
    }

    // Add or update markers
    flights.forEach(flight => {
        const { id, callsign, country, lng, lat, alt, velocity, heading } = flight;
        const isHidden = selectedFlightId !== null && id !== selectedFlightId;
        const isSelected = id === selectedFlightId;

        if (markers[id]) {
            // Update existing
            markers[id].setLngLat([lng, lat]);
            const el = markers[id].getElement();
            
            // Hide the 2D marker for the selected plane ONLY in 3D follow mode so the 3D model takes over
            el.style.display = isHidden ? 'none' : (isSelected && followMode === '3d' ? 'none' : 'block');
            
            const inner = el.querySelector('.plane-marker');
            if (inner) {
                // Subtract map bearing so the 2D marker stays correctly oriented regardless of camera rotation
                const visualHeading = heading - map.getBearing();
                inner.style.setProperty('--heading', `${visualHeading}deg`);
                if (!isRouteSearch) {
                    const hue = Math.min(300, (alt / 12000) * 300); // Color varies by altitude
                    inner.style.filter = `hue-rotate(${hue}deg)`;
                }
            }
            
            if (isSelected) {
                update3DModelPosition([lng, lat], alt, heading);
                updateFlightPanel(flight); // Real-time panel update
            }
        } else {
            // Create new marker container
            const el = document.createElement('div');
            el.className = 'plane-marker-container';
            el.style.display = isHidden ? 'none' : 'block';
            
            // Create inner marker for rotation/scaling
            const inner = document.createElement('div');
            inner.className = 'plane-marker';
            inner.style.setProperty('--heading', `${heading}deg`);
            if (isRouteSearch) {
                inner.style.filter = "hue-rotate(90deg)"; // Make searched flights a different color
            }
            
            el.appendChild(inner);
            
            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([lng, lat])
                .addTo(map);
                
            // Click event on the container
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                selectFlight(id, { id, callsign, country, lng, lat, alt, velocity, heading });
            });

            markers[id] = marker;
        }
    });
}

let lastTime = performance.now();
function animateFlights() {
    requestAnimationFrame(animateFlights);
    
    const now = performance.now();
    let dt = (now - lastTime) / 1000; // seconds
    if (dt > 0.1) dt = 0.1; // clamp dt to prevent massive jumps
    lastTime = now;

    const dataToAnimate = isMockMode ? mockFlightsData : (liveTrafficToggle.checked ? liveFlightsData : []);

    dataToAnimate.forEach(f => {
        if (f.progress !== undefined && f.originCoord && f.destCoord) {
            // Speed scaled down significantly so it matches the long flight durations better
            f.progress += (f.velocity / 8000) * dt; 
            if (f.progress > 100) f.progress = 0; // loop endlessly

            const t = f.progress / 100;
            const pos = getCurvePosition(f.originCoord, f.destCoord, t);
            
            // Calculate exact heading along the curve
            const posNext = getCurvePosition(f.originCoord, f.destCoord, Math.min(1, t + 0.001));
            let dx = posNext[0] - pos[0];
            if (dx > 180) dx -= 360;
            else if (dx < -180) dx += 360;
            let dy = posNext[1] - pos[1];
            
            let heading = Math.atan2(dx, dy) * (180 / Math.PI);
            if (heading < 0) heading += 360;

            f.lng = pos[0];
            f.lat = pos[1];
            f.heading = heading;
        }
    });

    updateMapMarkers(dataToAnimate, isMockMode);
    
    // Smoothly pan camera to follow selected flight ONLY after flyTo transitions finish
    // We also pause tracking while the user is scrolling to zoom, so MapLibre's zoom animation isn't interrupted
    if (selectedFlightId && followMode !== 'none' && map.getLayer('3d-model') && !isTransitioning && !isUserZooming) {
        const sf = dataToAnimate.find(f => f.id === selectedFlightId);
        if (sf) {
            // We use easeTo with 0 duration for smooth tracking without jitter
            // Add padding so the plane stays visually centered, avoiding the left panel
            const paddingLeft = window.innerWidth > 1000 ? 350 : (window.innerWidth > 768 ? 250 : 0);
            map.easeTo({
                center: [sf.lng, sf.lat],
                bearing: sf.heading,
                padding: { left: paddingLeft, right: 0, top: 0, bottom: 0 },
                duration: 0
            });
        }
    }
}

function selectFlight(id, data) {
    selectedFlightId = id;
    
    let flightObj = null;
    if (isMockMode) {
        flightObj = mockFlightsData.find(f => f.id === id);
    } else {
        flightObj = liveFlightsData.find(f => f.id === id);
    }
    
    const currentLng = flightObj ? flightObj.lng : data.lng;
    const currentLat = flightObj ? flightObj.lat : data.lat;

    if (flightObj && flightObj.originCoord && flightObj.destCoord) {
        // Draw the route line with labels
        drawRouteLine(flightObj.originCoord, flightObj.destCoord, flightObj.origin, flightObj.dest);

        // Zoom out to fit origin and destination
        const bounds = new maplibregl.LngLatBounds(flightObj.originCoord, flightObj.originCoord);
        bounds.extend(flightObj.destCoord);
        bounds.extend([currentLng, currentLat]);
        
        const paddingLeft = window.innerWidth > 1000 ? 350 : (window.innerWidth > 768 ? 250 : 50);
        isTransitioning = true;
        map.fitBounds(bounds, {
            padding: {top: 50, bottom: 50, left: paddingLeft, right: 50},
            pitch: 30, // Slightly pitched for 3D feel
            bearing: 0,
            maxZoom: 6,
            duration: 1500
        });
        map.once('moveend', () => isTransitioning = false);
    } else {
        isTransitioning = true;
        map.flyTo({
            center: [currentLng, currentLat],
            zoom: 6,
            pitch: 30,
            speed: 1.5
        });
        map.once('moveend', () => isTransitioning = false);
    }

    // Reset HTML to ensure button event listener binds fresh
    flightInfoContent.innerHTML = ''; 
    updateFlightPanel(flightObj || data);
    flightPanel.classList.add('active');
    
    // Create or update 3D model layer
    setup3DModel([currentLng, currentLat], flightObj ? flightObj.alt : data.alt, flightObj ? flightObj.heading : data.heading);

    // Setup follow button listeners
    const mapBtn = document.getElementById('followMapBtn');
    const camBtn = document.getElementById('followCamBtn');
    
    const handleFollowToggle = (mode) => {
        if (followMode === mode) followMode = 'none';
        else followMode = mode;

        if (mapBtn) {
            mapBtn.innerText = followMode === 'map' ? 'Stop Map Follow' : 'Follow (Map)';
            mapBtn.style.background = followMode === 'map' ? 'var(--primary-color)' : 'var(--bg-dark)';
            mapBtn.style.color = followMode === 'map' ? 'var(--bg-dark)' : 'var(--primary-color)';
        }
        if (camBtn) {
            camBtn.innerText = followMode === '3d' ? 'Stop 3D Follow' : 'Follow (3D)';
            camBtn.style.background = followMode === '3d' ? 'var(--accent-color)' : 'var(--primary-color)';
        }

        // Grab LIVE coordinates right now, because the plane has likely moved since the panel was opened!
        const dataToAnimate = isMockMode ? mockFlightsData : (liveTrafficToggle.checked ? liveFlightsData : []);
        const activeFlight = dataToAnimate.find(f => f.id === id);
        const liveLng = activeFlight ? activeFlight.lng : currentLng;
        const liveLat = activeFlight ? activeFlight.lat : currentLat;
        const liveHdg = activeFlight ? activeFlight.heading : (flightObj ? flightObj.heading : data.heading);

        isTransitioning = true;

        if (followMode === 'map') {
            map.flyTo({
                center: [liveLng, liveLat],
                zoom: 7,
                pitch: 30,
                bearing: liveHdg,
                speed: 1.5
            });
            map.once('moveend', () => isTransitioning = false);
        } else if (followMode === '3d') {
            map.flyTo({
                center: [liveLng, liveLat],
                zoom: 16,
                pitch: 80,
                bearing: liveHdg,
                speed: 1.5
            });
            map.once('moveend', () => isTransitioning = false);
        } else {
            // Fly back to route bounds
            if (flightObj && flightObj.originCoord && flightObj.destCoord) {
                const bounds = new maplibregl.LngLatBounds(flightObj.originCoord, flightObj.originCoord);
                bounds.extend(flightObj.destCoord);
                bounds.extend([liveLng, liveLat]);
                const paddingLeft = window.innerWidth > 1000 ? 350 : (window.innerWidth > 768 ? 250 : 50);
                map.fitBounds(bounds, {
                    padding: {top: 50, bottom: 50, left: paddingLeft, right: 50},
                    pitch: 30,
                    bearing: 0,
                    duration: 1500
                });
            } else {
                map.flyTo({ zoom: 4, pitch: 30 });
            }
            map.once('moveend', () => isTransitioning = false);
        }
    };

    if (mapBtn) mapBtn.addEventListener('click', () => handleFollowToggle('map'));
    if (camBtn) camBtn.addEventListener('click', () => handleFollowToggle('3d'));
}

function drawRouteLine(originCoord, destCoord, originName, destName) {
    const coords = [];
    for(let i=0; i<=100; i++) {
        coords.push(getCurvePosition(originCoord, destCoord, i/100));
    }

    const pointsData = {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: originCoord },
                properties: { title: originName || 'Origin' }
            },
            {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: destCoord },
                properties: { title: destName || 'Destination' }
            }
        ]
    };

    if (map.getSource('route-points')) {
        map.getSource('route-points').setData(pointsData);
    } else {
        map.addSource('route-points', { type: 'geojson', data: pointsData });
        map.addLayer({
            id: 'route-points-circle',
            type: 'circle',
            source: 'route-points',
            paint: {
                'circle-radius': 6,
                'circle-color': '#000000',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#00f0ff'
            }
        });
        map.addLayer({
            id: 'route-points-label',
            type: 'symbol',
            source: 'route-points',
            layout: {
                'text-field': ['get', 'title'],
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-size': 14,
                'text-offset': [0, 1.2],
                'text-anchor': 'top'
            },
            paint: {
                'text-color': '#ffffff',
                'text-halo-color': '#000000',
                'text-halo-width': 2
            }
        });
    }

    if (map.getSource('route')) {
        map.getSource('route').setData({
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'LineString',
                coordinates: coords
            }
        });
    } else {
        map.addSource('route', {
            type: 'geojson',
            lineMetrics: true,
            data: {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: coords
                }
            }
        });
        map.addLayer({
            id: 'route',
            type: 'line',
            source: 'route',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-width': 5,
                'line-gradient': [
                    'interpolate',
                    ['linear'],
                    ['line-progress'],
                    0, '#7000ff',
                    0.5, '#00f0ff',
                    1, '#ff0055'
                ],
                'line-opacity': 0.9
            }
        });
    }
}

function updateFlightPanel(data) {
    let origin = "UNK";
    let dest = "UNK";
    let depTime = "--:--";
    let arrTime = "--:--";
    let progress = 50;

    // First check route search mock data
    let flightObj = null;
    if (isMockMode) {
        flightObj = mockFlightsData.find(f => f.id === data.id);
    } else {
        flightObj = liveFlightsData.find(f => f.id === data.id);
    }
    
    if (flightObj) {
        origin = flightObj.origin;
        dest = flightObj.dest;
        depTime = flightObj.depTime;
        arrTime = flightObj.arrTime;
        progress = flightObj.progress || 50;
    }

    if (!document.getElementById('live-alt')) {
        flightInfoContent.innerHTML = `
            <div class="route-container">
                <div class="route-points">
                    <div class="point">
                        <h3>${origin.substring(0, 3).toUpperCase()}</h3>
                        <p>${origin}</p>
                        <p style="font-size: 10px; margin-top: 4px; color: var(--primary-color);">${depTime}</p>
                    </div>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="2" style="z-index:2; background:var(--bg-dark); padding:2px;"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    <div class="point">
                        <h3>${dest.substring(0, 3).toUpperCase()}</h3>
                        <p>${dest}</p>
                        <p style="font-size: 10px; margin-top: 4px; color: var(--primary-color);">${arrTime}</p>
                    </div>
                </div>
                
                <div class="progress-container">
                    <div class="progress-bar" id="live-prog" style="width: ${progress}%"></div>
                </div>
                <div class="time-info">
                    <span>Departed</span>
                    <span>${arrTime}</span>
                </div>
            </div>
            
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Callsign</div>
                    <div class="detail-val">${data.callsign}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Country</div>
                    <div class="detail-val" style="font-size: 14px; word-break: break-all;">${data.country}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Altitude</div>
                    <div class="detail-val" id="live-alt">${Math.round(data.alt)} m</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Speed</div>
                    <div class="detail-val" id="live-spd">${Math.round(data.velocity * 3.6)} km/h</div>
                </div>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 16px;">
                <button id="followMapBtn" style="flex: 1; background: ${followMode === 'map' ? 'var(--primary-color)' : 'var(--bg-dark)'}; color: ${followMode === 'map' ? 'var(--bg-dark)' : 'var(--primary-color)'}; padding: 12px; border-radius: 8px; border: 1px solid var(--primary-color); font-weight: 600; cursor: pointer; transition: all 0.2s;">
                    ${followMode === 'map' ? 'Stop Map Follow' : 'Follow (Map)'}
                </button>
                <button id="followCamBtn" style="flex: 1; background: ${followMode === '3d' ? 'var(--accent-color)' : 'var(--primary-color)'}; color: var(--bg-dark); padding: 12px; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                    ${followMode === '3d' ? 'Stop 3D Follow' : 'Follow (3D)'}
                </button>
            </div>
        `;
    } else {
        document.getElementById('live-alt').innerText = `${Math.round(data.alt)} m`;
        document.getElementById('live-spd').innerText = `${Math.round(data.velocity * 3.6)} km/h`;
        document.getElementById('live-prog').style.width = `${progress}%`;
    }
}

closePanelBtn.addEventListener('click', () => {
    flightPanel.classList.remove('active');
    selectedFlightId = null;
    followMode = 'none';
    if (map.getLayer('3d-model')) {
        modelTransform.scale = 0; // Hide it by scaling to 0 instead of destroying WebGL context
    }
    if (map.getLayer('route')) {
        map.removeLayer('route');
        map.removeSource('route');
    }
    if (map.getLayer('route-points-circle')) {
        map.removeLayer('route-points-circle');
        map.removeLayer('route-points-label');
        map.removeSource('route-points');
    }
    
    // Unhide all planes
    for (const id in markers) {
        markers[id].getElement().style.display = 'block';
    }
    
    // Automatically reset position on the globe
    isTransitioning = true;
    map.flyTo({
        center: [0, 20],
        zoom: 2,
        pitch: 0,
        bearing: 0,
        speed: 1.2
    });
    map.once('moveend', () => isTransitioning = false);
});

liveTrafficToggle.addEventListener('change', (e) => {
    if (isMockMode) return; // Don't toggle live traffic if we are in route search mode
    
    if (e.target.checked) {
        updateMapMarkers(liveFlightsData, false);
        statusText.innerText = "System Active";
        pulseIndicator.style.backgroundColor = "#00ff88";
        pulseIndicator.style.boxShadow = "0 0 12px #00ff88";
    } else {
        // Clear markers
        updateMapMarkers([], false);
        statusText.innerText = "System Standby";
        pulseIndicator.style.backgroundColor = "#8b9bb4";
        pulseIndicator.style.boxShadow = "none";
    }
});

// Search Logic
searchBtn.addEventListener('click', handleSearch);
routeSearch.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
});

function handleSearch() {
    const query = routeSearch.value.trim().toLowerCase();
    if (!query) {
        isMockMode = false;
        statusText.innerText = "System Active";
        fetchFlights();
        return;
    }

    // Basic parse e.g. "calgary to italy"
    const parts = query.split(' to ');
    const origin = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : "Origin";
    const dest = parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : "Destination";

    isMockMode = true;
    statusText.innerText = `Tracking ${origin} -> ${dest}`;
    
    // Clear live flights
    for (const id in markers) {
        markers[id].remove();
        delete markers[id];
    }

    // Provide some fake coordinates for the search mock route
    const mockOriginCoord = [-114, 51]; // e.g. near Calgary
    const mockDestCoord = [12, 41]; // e.g. near Italy

    // Create 3 mock flights for this route
    mockFlightsData = [
        { id: 'mock1', callsign: 'WJA992', country: 'Canada', lng: -50, lat: 55, alt: 10500, velocity: 240, heading: 95, origin, dest, depTime: '08:30 AM', arrTime: '11:45 PM', progress: 40, originCoord: mockOriginCoord, destCoord: mockDestCoord },
        { id: 'mock2', callsign: 'ACA834', country: 'Canada', lng: -30, lat: 58, alt: 11000, velocity: 250, heading: 100, origin, dest, depTime: '10:00 AM', arrTime: '01:15 AM', progress: 65, originCoord: mockOriginCoord, destCoord: mockDestCoord },
        { id: 'mock3', callsign: 'RYR12', country: 'Italy', lng: -10, lat: 50, alt: 9500, velocity: 230, heading: 110, origin, dest, depTime: '01:00 PM', arrTime: '04:30 AM', progress: 85, originCoord: mockOriginCoord, destCoord: mockDestCoord }
    ];

    updateMapMarkers(mockFlightsData, true);
    
    // Fly map to the middle of the Atlantic
    map.flyTo({
        center: [-30, 55],
        zoom: 3,
        pitch: 0,
        bearing: 0
    });
}

// --- 3D Model Implementation via Three.js Custom Layer ---
// Based on Mapbox/MapLibre custom layer examples

let modelTransform = {
    translateX: 0,
    translateY: 0,
    translateZ: 0,
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
    scale: 1
};

function setup3DModel(lngLat, altitude, heading) {
    update3DModelPosition(lngLat, altitude, heading);

    if (map.getLayer('3d-model')) return; // Already added

    const customLayer = {
        id: '3d-model',
        type: 'custom',
        renderingMode: '3d',
        onAdd: function (map, gl) {
            this.camera = new THREE.Camera();
            this.scene = new THREE.Scene();

            // Lighting
            const directionalLight = new THREE.DirectionalLight(0xffffff);
            directionalLight.position.set(0, -70, 100).normalize();
            this.scene.add(directionalLight);

            const directionalLight2 = new THREE.DirectionalLight(0xffffff);
            directionalLight2.position.set(0, 70, 100).normalize();
            this.scene.add(directionalLight2);
            
            this.scene.add(new THREE.AmbientLight(0x404040, 3)); // Soft white light

            // Create a premium, highly detailed 3D plane
            const planeGroup = new THREE.Group();
            
            // Correct the orientation so +Z (front) maps to +Y (North)
            planeGroup.rotation.x = -Math.PI / 2;

            // Use MeshPhongMaterial instead of Physical to guarantee compatibility with MapLibre's WebGL context
            const metalMaterial = new THREE.MeshPhongMaterial({ 
                color: 0xdddddd, 
                specular: 0x555555,
                shininess: 50
            });
            
            const glassMaterial = new THREE.MeshPhongMaterial({
                color: 0x111111,
                specular: 0xffffff,
                shininess: 90,
                transparent: true,
                opacity: 0.8
            });
            
            const accentMaterial = new THREE.MeshPhongMaterial({ 
                color: 0x00f0ff,
                specular: 0xffffff,
                shininess: 100
            });

            // 1. Aerodynamic Fuselage
            const fuselageGeom = new THREE.CylinderGeometry(1.5, 1.8, 24, 32);
            fuselageGeom.rotateX(Math.PI / 2);
            // Taper the nose
            const pos = fuselageGeom.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const z = pos.getZ(i);
                if (z > 6) { // Nose section
                    const scale = 1 - ((z - 6) / 6) * 0.8;
                    pos.setX(i, pos.getX(i) * scale);
                    pos.setY(i, pos.getY(i) * scale);
                }
                if (z < -8) { // Tail section taper
                    const scale = 1 - ((-z - 8) / 4) * 0.6;
                    pos.setX(i, pos.getX(i) * scale);
                    pos.setY(i, pos.getY(i) * scale);
                }
            }
            fuselageGeom.computeVertexNormals();
            const fuselage = new THREE.Mesh(fuselageGeom, metalMaterial);
            planeGroup.add(fuselage);
            
            // Cockpit Window
            const cockpitGeom = new THREE.SphereGeometry(1.4, 16, 16, 0, Math.PI, 0, Math.PI/2);
            const cockpit = new THREE.Mesh(cockpitGeom, glassMaterial);
            cockpit.position.set(0, 0.6, 8);
            cockpit.scale.set(1, 0.4, 2);
            planeGroup.add(cockpit);
            
            // 2. Swept Wings
            const wingShape = new THREE.Shape();
            wingShape.moveTo(0, 0);
            wingShape.lineTo(14, -6); // Wingtip back
            wingShape.lineTo(14, -8); // Wingtip trailing edge
            wingShape.lineTo(0, -4);  // Wing root trailing edge
            
            const extrudeSettings = { depth: 0.5, bevelEnabled: true, bevelSegments: 2, steps: 2, bevelSize: 0.1, bevelThickness: 0.1 };
            const wingGeom = new THREE.ExtrudeGeometry(wingShape, extrudeSettings);
            wingGeom.rotateX(Math.PI / 2);
            
            const rightWing = new THREE.Mesh(wingGeom, metalMaterial);
            rightWing.position.set(1.5, 0, 2);
            planeGroup.add(rightWing);
            
            const leftWing = rightWing.clone();
            leftWing.scale.set(-1, 1, 1);
            leftWing.position.set(-1.5, 0, 2);
            planeGroup.add(leftWing);
            
            // 3. Engines (Jet Turbines)
            const engineGeom = new THREE.CylinderGeometry(0.8, 0.9, 4, 32);
            engineGeom.rotateX(Math.PI / 2);
            const rightEngine = new THREE.Mesh(engineGeom, metalMaterial);
            rightEngine.position.set(5, -0.8, -1);
            planeGroup.add(rightEngine);
            
            const leftEngine = rightEngine.clone();
            leftEngine.position.set(-5, -0.8, -1);
            planeGroup.add(leftEngine);
            
            // Engine Accents (Glowing intake)
            const intakeGeom = new THREE.CylinderGeometry(0.7, 0.7, 0.2, 32);
            intakeGeom.rotateX(Math.PI / 2);
            const rightIntake = new THREE.Mesh(intakeGeom, accentMaterial);
            rightIntake.position.set(5, -0.8, 1.1);
            planeGroup.add(rightIntake);
            const leftIntake = rightIntake.clone();
            leftIntake.position.set(-5, -0.8, 1.1);
            planeGroup.add(leftIntake);
            
            // 4. Tail (Vertical Stabilizer)
            const tailShape = new THREE.Shape();
            tailShape.moveTo(0, 0);
            tailShape.lineTo(0, 6);
            tailShape.lineTo(2, 6);
            tailShape.lineTo(4, 0);
            const tailExtrude = new THREE.ExtrudeGeometry(tailShape, {depth: 0.4, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05});
            const verticalTail = new THREE.Mesh(tailExtrude, accentMaterial);
            verticalTail.position.set(-0.2, 1, -11);
            planeGroup.add(verticalTail);
            
            // Horizontal Stabilizers
            const hTailShape = new THREE.Shape();
            hTailShape.moveTo(0, 0);
            hTailShape.lineTo(5, -2);
            hTailShape.lineTo(5, -3);
            hTailShape.lineTo(0, -1);
            const hTailExtrude = new THREE.ExtrudeGeometry(hTailShape, {depth: 0.2, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05});
            hTailExtrude.rotateX(Math.PI/2);
            const rightHTail = new THREE.Mesh(hTailExtrude, metalMaterial);
            rightHTail.position.set(0.5, 1.5, -9);
            planeGroup.add(rightHTail);
            
            const leftHTail = rightHTail.clone();
            leftHTail.scale.set(-1, 1, 1);
            leftHTail.position.set(-0.5, 1.5, -9);
            planeGroup.add(leftHTail);
            
            // Add a subtle spotlight following the plane
            const spotLight = new THREE.SpotLight(0xff00ff, 100);
            spotLight.position.set(0, 10, 5); // Positioned above and slightly behind
            spotLight.angle = Math.PI / 4;
            spotLight.penumbra = 0.5;
            spotLight.target.position.set(0, 0, 10); // Pointing forward
            planeGroup.add(spotLight);
            planeGroup.add(spotLight.target);
            
            // Add engine glow trails
            const trailGeom = new THREE.CylinderGeometry(0.5, 0.1, 20, 8);
            trailGeom.rotateX(Math.PI / 2);
            const trailMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
            const rightTrail = new THREE.Mesh(trailGeom, trailMat);
            rightTrail.position.set(5, -0.8, -12);
            planeGroup.add(rightTrail);
            const leftTrail = rightTrail.clone();
            leftTrail.position.set(-5, -0.8, -12);
            planeGroup.add(leftTrail);

            this.scene.add(planeGroup);
            this.map = map;

            this.renderer = new THREE.WebGLRenderer({
                canvas: map.getCanvas(),
                context: gl,
                antialias: true
            });
            this.renderer.autoClear = false;
        },
        render: function (gl, matrix) {
            const m = new THREE.Matrix4().fromArray(matrix);
            const l = new THREE.Matrix4()
                .makeTranslation(modelTransform.translateX, modelTransform.translateY, modelTransform.translateZ)
                .scale(new THREE.Vector3(modelTransform.scale, -modelTransform.scale, modelTransform.scale))
                .multiply(new THREE.Matrix4().makeRotationZ(modelTransform.rotateZ));

            this.camera.projectionMatrix = m.multiply(l);
            this.renderer.resetState();
            this.renderer.render(this.scene, this.camera);
            this.map.triggerRepaint();
        }
    };

    map.addLayer(customLayer);
}

function update3DModelPosition(lngLat, altitude, heading) {
    // MapLibre uses Mercator coordinates
    // Set altitude to 0 so the 3D model sits perfectly on the map surface!
    // MapLibre's camera tracks the ground (Z=0). If the plane was at 10,000m, it was flying way above the camera viewport!
    const modelAltitude = 0; 
    const mercatorCoordinate = maplibregl.MercatorCoordinate.fromLngLat(
        lngLat,
        modelAltitude
    );

    // Scale depends on latitude
    const modelScale = mercatorCoordinate.meterInMercatorCoordinateUnits() * 25; // 25x scale so it is easily visible and unmistakable

    modelTransform.translateX = mercatorCoordinate.x;
    modelTransform.translateY = mercatorCoordinate.y;
    modelTransform.translateZ = mercatorCoordinate.z;
    // Rotate to match heading. Three.js rotation requires some math to match map bearing
    modelTransform.rotateZ = (-heading * Math.PI) / 180;
    modelTransform.scale = modelScale;
}
