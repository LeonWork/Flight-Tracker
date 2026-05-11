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

// Initialize MapLibre Map (Using Satellite imagery with custom dark overlay)
const map = new maplibregl.Map({
    container: 'map',
    style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
            'satellite': {
                type: 'raster',
                tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                tileSize: 256,
                maxzoom: 12
            }
        },
        layers: [
            {
                id: 'satellite-layer',
                type: 'raster',
                source: 'satellite',
                paint: {
                    'raster-saturation': -0.2,
                    'raster-contrast': 0.1
                }
            },
            {
                id: 'dark-overlay',
                type: 'background',
                paint: {
                    'background-color': '#020d1a',
                    'background-opacity': 0.65
                }
            }
        ]
    },
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

// Map visual styling handled in style definition directly now

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
            
            // Calculate exact heading along the curve using Mercator Coordinates for true visual alignment
            const posNext = getCurvePosition(f.originCoord, f.destCoord, Math.min(1, t + 0.001));
            const p1 = maplibregl.MercatorCoordinate.fromLngLat(pos);
            const p2 = maplibregl.MercatorCoordinate.fromLngLat(posNext);
            
            let heading = Math.atan2(p2.x - p1.x, p1.y - p2.y) * (180 / Math.PI);
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
            // We use easeTo with 0 duration for smooth tracking without jitter.
            // We omit bearing and pitch so the user can freely rotate/zoom the camera while tracking!
            map.easeTo({
                center: [sf.lng, sf.lat],
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
    setup3DModel([currentLng, currentLat], flightObj ? flightObj.alt : data.alt, flightObj ? flightObj.heading : data.heading, flightObj || data);

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
                duration: 1500
            });
            map.once('moveend', () => isTransitioning = false);
        } else if (followMode === '3d') {
            map.flyTo({
                center: [liveLng, liveLat],
                zoom: 14,
                pitch: 80,
                bearing: liveHdg,
                duration: 2000
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
                        <p style="font-size: 10px; margin-top: 4px; color: var(--primary-color);">${depTime}</p>
                    </div>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="2" style="z-index:2; background:var(--bg-dark); padding:2px;"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    <div class="point">
                        <h3>${dest.substring(0, 3).toUpperCase()}</h3>
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
        if (map.getLayer('route-points-label')) map.removeLayer('route-points-label');
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

    // If we were in mock mode (route search), clear it out so it stops tracking
    if (isMockMode) {
        isMockMode = false;
        routeSearch.value = "";
        statusText.innerText = "System Active";
        fetchFlights();
    }
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

    // Auto-select the first flight so it pops up and tracks immediately
    setTimeout(() => {
        const firstFlightMarker = document.querySelector('.flight-marker');
        if (firstFlightMarker) {
            firstFlightMarker.click();
        }
    }, 600);
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

let planeMaterials = { primary: null, accent: null };

function setup3DModel(lngLat, altitude, heading, flightData) {
    update3DModelPosition(lngLat, altitude, heading);

    // Calculate colors
    let primaryColor = 0xdddddd;
    let accentCol = 0x00f0ff;
    if (flightData) {
        const callsign = flightData.callsign || "";
        if (callsign.startsWith("WJA")) { primaryColor = 0x004c4c; accentCol = 0x00e6e6; }
        else if (callsign.startsWith("ACA")) { primaryColor = 0xffffff; accentCol = 0xcc0000; }
        else if (callsign.startsWith("RYR")) { primaryColor = 0x003399; accentCol = 0xf1c40f; }
        else if (callsign.startsWith("UAL")) { primaryColor = 0x003366; accentCol = 0xffcc00; }
        else {
            let hash = 0;
            for (let i = 0; i < callsign.length; i++) hash = callsign.charCodeAt(i) + ((hash << 5) - hash);
            const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
            primaryColor = parseInt("0x" + "00000".substring(0, 6 - c.length) + c);
            accentCol = 0xffffff - primaryColor;
        }
    }

    if (map.getLayer('3d-model')) {
        // Update existing model colors
        if (planeMaterials.primary) planeMaterials.primary.color.setHex(primaryColor);
        if (planeMaterials.accent) planeMaterials.accent.color.setHex(accentCol);
        return; 
    }

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
                color: primaryColor, 
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
                color: accentCol,
                specular: 0xffffff,
                shininess: 100
            });

            planeMaterials.primary = metalMaterial;
            planeMaterials.accent = accentMaterial;

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

// --- Trip Planning Logic ---
const tripsBtn = document.getElementById('tripsBtn');
const tripPanel = document.getElementById('tripPanel');
const closeTripPanelBtn = document.getElementById('closeTripPanel');
const tripInfoContent = document.getElementById('tripInfoContent');

const featuredTrips = [
    { route: "Calgary to Vegas", origin: "YYC", dest: "LAS", name: "Neon Luxury Resort", price: "$1,250", img: "https://images.unsplash.com/photo-1605810230434-7631ac76ec81?auto=format&fit=crop&w=800&q=80" },
    { route: "JFK to Paris", origin: "JFK", dest: "CDG", name: "Parisian Elegance", price: "$1,570", img: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80" },
    { route: "Tokyo to Sydney", origin: "HND", dest: "SYD", name: "Sydney Harbour View", price: "$2,480", img: "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=800&q=80" },
    { route: "London to Dubai", origin: "LHR", dest: "DXB", name: "Desert Oasis Resort", price: "$1,640", img: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=800&q=80" },
    { route: "Miami to Cancun", origin: "MIA", dest: "CUN", name: "Emerald Bay All-Inclusive", price: "$950", img: "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=800&q=80" },
    { route: "Chicago to Rome", origin: "ORD", dest: "FCO", name: "Historic Roman Villa", price: "$1,890", img: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=800&q=80" },
    { route: "Vancouver to Maui", origin: "YVR", dest: "OGG", name: "Sunset Palms Retreat", price: "$2,100", img: "https://images.unsplash.com/photo-1544365558-35aa4afcf11f?auto=format&fit=crop&w=800&q=80" },
    { route: "Toronto to London", origin: "YYZ", dest: "LHR", name: "Metropolitan Suites", price: "$1,420", img: "https://images.unsplash.com/photo-1513635269975-5969336cb1c4?auto=format&fit=crop&w=800&q=80" }
];

const exploreModal = document.getElementById('exploreModal');
const closeExploreModal = document.getElementById('closeExploreModal');
const exploreGridContent = document.getElementById('exploreGridContent');

function renderTrips() {
    exploreGridContent.innerHTML = '';
    featuredTrips.forEach(trip => {
        const card = document.createElement('div');
        card.className = 'explore-card';
        card.innerHTML = `
            <div class="explore-card-img" style="background-image: url('${trip.img}');"></div>
            <div class="explore-card-content">
                <div class="explore-card-title">${trip.name}</div>
                <div class="explore-card-subtitle">${trip.route}</div>
                <div class="explore-card-price">
                    <span>Starting from</span>
                    <span>${trip.price}</span>
                </div>
            </div>
        `;
        
        card.addEventListener('click', () => {
            // Trigger the new package search flow for the featured route
            bookOrigin.value = trip.origin;
            bookDest.value = trip.dest;
            // Set some default future dates
            const tmr = new Date(); tmr.setDate(tmr.getDate() + 14);
            const ret = new Date(); ret.setDate(ret.getDate() + 21);
            bookDepart.value = tmr.toISOString().split('T')[0];
            bookReturn.value = ret.toISOString().split('T')[0];
            
            bookSearchBtn.click();
        });
        
        exploreGridContent.appendChild(card);
    });
}

tripsBtn.addEventListener('click', () => {
    renderTrips();
    exploreModal.classList.remove('hidden');
    // Hide flight panel if open
    flightPanel.classList.remove('active');
});

if(closeExploreModal) {
    closeExploreModal.addEventListener('click', () => {
        exploreModal.classList.add('hidden');
    });
}

// Booking Form Logic
const bookSearchBtn = document.getElementById('bookSearchBtn');
const bookOrigin = document.getElementById('bookOrigin');
const bookDest = document.getElementById('bookDest');
const bookDepart = document.getElementById('bookDepart');
const bookReturn = document.getElementById('bookReturn');
const bookClass = document.getElementById('bookClass');
const bookPassengers = document.getElementById('bookPassengers');

// Package Results Elements
const packageResultsModal = document.getElementById('packageResultsModal');
const closePackageResults = document.getElementById('closePackageResults');
const packageListContent = document.getElementById('packageListContent');
const packageResultsTitle = document.getElementById('packageResultsTitle');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');

let currentPackageResults = [];

if(closePackageResults) {
    closePackageResults.addEventListener('click', () => {
        packageResultsModal.classList.add('hidden');
    });
}

// Filter listeners
document.querySelectorAll('.filter-stars, .filter-amenities').forEach(cb => {
    cb.addEventListener('change', () => {
        renderPackageResults();
    });
});

if(clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', () => {
        document.querySelectorAll('.filter-stars').forEach(cb => cb.checked = true);
        document.querySelectorAll('.filter-amenities').forEach(cb => cb.checked = false);
        renderPackageResults();
    });
}

function renderPackageResults() {
    if (!currentPackageResults.length) return;

    // Get active filters
    const activeStars = Array.from(document.querySelectorAll('.filter-stars:checked')).map(cb => parseInt(cb.value));
    const activeAmenities = Array.from(document.querySelectorAll('.filter-amenities:checked')).map(cb => cb.value);

    // Filter logic
    const filteredTrips = currentPackageResults.filter(trip => {
        // If stars are selected, it must exactly match one of the selected
        if (activeStars.length > 0 && !activeStars.includes(trip.stars)) return false;
        
        // Ensure all checked amenities are present
        if (activeAmenities.length > 0) {
            const hasAllAmenities = activeAmenities.every(a => trip.amenities.includes(a));
            if (!hasAllAmenities) return false;
        }

        return true;
    });

    packageListContent.innerHTML = '';
    
    if (filteredTrips.length === 0) {
        packageListContent.innerHTML = `<div style="text-align: center; padding: 48px; color: var(--text-muted);">No packages match your exact filters. Try clearing them.</div>`;
        return;
    }

    filteredTrips.forEach(trip => {
        const card = document.createElement('div');
        card.className = 'package-result-card';
        
        let tagsHtml = trip.amenities.map(a => {
            if(a==='pool') return '<span class="package-tag highlight">Pool Access</span>';
            if(a==='wifi') return '<span class="package-tag">Free WiFi</span>';
            if(a==='view') return '<span class="package-tag highlight">Ocean View</span>';
            if(a==='allinclusive') return '<span class="package-tag highlight" style="color: #00ff88; background: rgba(0,255,136,0.1);">All Inclusive</span>';
            return '';
        }).join('');

        card.innerHTML = `
            <div class="package-img" style="background-image: url('${trip.image}');">
                <div class="package-img-badge">${trip.stars} Star Property</div>
            </div>
            <div class="package-details">
                <div>
                    <div class="package-title">${trip.hotelName}</div>
                    <div class="package-location">${trip.destCode.toUpperCase()} City Center • Includes Flight (${trip.className})</div>
                    <div class="package-tags">
                        ${tagsHtml}
                        <span class="package-tag">Fully refundable</span>
                    </div>
                </div>
                <div class="package-rating">
                    <div class="rating-badge">${trip.ratingScore}</div>
                    <div class="rating-text">${trip.ratingText} (${trip.reviewCount} reviews)</div>
                </div>
            </div>
            <div class="package-pricing">
                <div style="text-align: right; margin-bottom: auto;">
                    <div class="price-label">Est. per night</div>
                    <div style="font-size: 16px; font-weight: bold;">$${Math.round((trip.bestPrice / trip.nights) * 0.9).toLocaleString()} - $${Math.round((trip.bestPrice / trip.nights) * 1.1).toLocaleString()}</div>
                </div>
                <div>
                    <div class="price-value" style="font-size: 22px;">$${Math.round(trip.bestPrice * 0.9).toLocaleString()} - $${Math.round(trip.bestPrice * 1.1).toLocaleString()}</div>
                    <div class="price-total-label">Est. total for ${trip.nights} nights & flight<br>Prices vary by provider</div>
                    <button class="select-package-btn">View Details</button>
                </div>
            </div>
        `;
        
        card.querySelector('.select-package-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            routeSearch.value = trip.route;
            handleSearch(); // Fly map
            openPropertyDetails(trip);
        });
        
        packageListContent.appendChild(card);
    });
}

const cityToIATA = {
    "calgary": "YYC", "vegas": "LAS", "las vegas": "LAS", "new york": "JFK",
    "paris": "CDG", "tokyo": "HND", "sydney": "SYD", "london": "LHR",
    "dubai": "DXB", "los angeles": "LAX", "rome": "FCO", "toronto": "YYZ",
    "miami": "MIA", "chicago": "ORD", "vancouver": "YVR"
};

bookSearchBtn.addEventListener('click', () => {
    let rawOrigin = bookOrigin.value.trim().toLowerCase() || "new york";
    let rawDest = bookDest.value.trim().toLowerCase() || "london";
    
    const origin = cityToIATA[rawOrigin] || rawOrigin;
    const dest = cityToIATA[rawDest] || rawDest;
    const cabin = bookClass.value;
    const passengers = bookPassengers ? bookPassengers.value : "2";
    
    let nights = 7;
    if (bookDepart.value && bookReturn.value) {
        const d1 = new Date(bookDepart.value);
        const d2 = new Date(bookReturn.value);
        const diffDays = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)); 
        if (diffDays > 0) nights = diffDays;
    }

    let multiplier = 1;
    let className = "Economy";
    if (cabin === 'premium') { multiplier = 1.5; className = "Premium Economy"; }
    if (cabin === 'business') { multiplier = 3.2; className = "Business Class"; }
    if (cabin === 'first') { multiplier = 5.5; className = "First Class"; }

    exploreModal.classList.add('hidden');
    packageResultsModal.classList.remove('hidden');
    packageResultsTitle.innerText = `${origin.toUpperCase()} to ${dest.toUpperCase()} • ${passengers} Travelers`;

    packageListContent.innerHTML = `
        <div class="ai-loading" style="margin-top: 100px;">
            <div class="ai-loading-spinner"></div>
            <p>Searching thousands of packages across the internet...</p>
        </div>
    `;

    setTimeout(() => {
        currentPackageResults = [];
        
        const adjectives = ["Grand", "Azure", "Neon", "Metropolitan", "Sunset", "Royal", "Emerald", "Platinum", "Golden", "Crystal", "Imperial", "Diamond"];
        const nouns = ["Horizon", "Pinnacle", "Seas", "Palms", "Cove", "Oasis", "Heights", "Bay", "Gardens", "Sands"];
        const types = ["Resort & Spa", "Hotel", "Retreat", "Suites", "Lodge", "Villas"];
        
        const images = [
            "https://images.unsplash.com/photo-1542314831-c6a4d14d8373?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1551882547-ff40c0d5b5df?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1596436889106-be35e843f974?auto=format&fit=crop&w=800&q=80",
            "https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=800&q=80"
        ];

        // Generate 15 deep search results
        for (let i = 0; i < 15; i++) {
            const baseFlight = Math.floor((300 + Math.random() * 200) * multiplier * passengers);
            const baseHotel = Math.floor((150 * nights) + Math.random() * 500); // Hotel price is usually per room, but simplify
            
            const providers = [
                { name: 'Expedia', price: baseFlight + baseHotel + Math.floor(Math.random() * 80 - 20) },
                { name: 'Google Flights', price: baseFlight + baseHotel + Math.floor(Math.random() * 80 - 20) },
                { name: 'Kayak', price: baseFlight + baseHotel + Math.floor(Math.random() * 80 - 20) },
                { name: 'Skyscanner', price: baseFlight + baseHotel + Math.floor(Math.random() * 80 - 20) },
                { name: 'Booking.com', price: baseFlight + baseHotel + Math.floor(Math.random() * 80 - 20) },
                { name: 'Priceline', price: baseFlight + baseHotel + Math.floor(Math.random() * 80 - 20) },
                { name: 'Agoda', price: baseFlight + baseHotel + Math.floor(Math.random() * 80 - 20) },
                { name: 'Orbitz', price: baseFlight + baseHotel + Math.floor(Math.random() * 80 - 20) }
            ];
            
            providers.sort((a,b) => a.price - b.price);
            providers[0].best = true;
            
            const flightCode = ['BA12', 'AA404', 'AF22', 'EK4', 'DL88', 'UA120', 'LH400'][Math.floor(Math.random() * 7)];
            const aircraft = ['Boeing 777-300ER', 'Airbus A350-900', 'Boeing 787 Dreamliner', 'Airbus A380'][Math.floor(Math.random() * 4)];
            
            const ratingScore = (7.5 + Math.random() * 2.4).toFixed(1);
            const ratingText = parseFloat(ratingScore) > 9 ? "Exceptional" : (parseFloat(ratingScore) > 8 ? "Excellent" : "Very Good");
            
            // Bias towards higher stars for luxury queries, but distribute them
            const stars = Math.random() > 0.6 ? 5 : (Math.random() > 0.4 ? 4 : 3);
            
            const amenities = [];
            if(Math.random() > 0.2) amenities.push('wifi'); // Almost all have wifi
            if(stars >= 4 || Math.random() > 0.4) amenities.push('pool');
            if(Math.random() > 0.6) amenities.push('view');
            if(stars === 5 && Math.random() > 0.5) amenities.push('allinclusive');
            
            const hotelName = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]} ${types[Math.floor(Math.random() * types.length)]}`;
            
            currentPackageResults.push({
                originCode: origin,
                destCode: dest,
                departDate: bookDepart.value || "",
                returnDate: bookReturn.value || "",
                passengers: passengers,
                route: `${origin.toUpperCase()} to ${dest.toUpperCase()}`,
                hotelName: hotelName,
                image: images[Math.floor(Math.random() * images.length)],
                ratingScore: ratingScore + "/10",
                ratingText: ratingText,
                reviewCount: Math.floor(Math.random() * 3000) + 100,
                stars: stars,
                amenities: amenities,
                duration: "5h 20m",
                className: className,
                nights: nights,
                providers: providers,
                bestPrice: providers[0].price,
                flightCode: flightCode,
                aircraft: aircraft
            });
        }

        renderPackageResults();

    }, 2000); // 2.0s delay for deep search effect
});

// Property Details Modal Logic
const propertyDetailsModal = document.getElementById('propertyDetailsModal');
const closePropertyModalBtn = document.getElementById('closePropertyModalBtn');
const propContinueBtn = document.getElementById('propContinueBtn');
let currentSelectedTrip = null;

if(closePropertyModalBtn) {
    closePropertyModalBtn.addEventListener('click', () => {
        propertyDetailsModal.classList.add('hidden');
        packageResultsModal.classList.remove('hidden');
    });
}

function openPropertyDetails(trip) {
    currentSelectedTrip = trip;
    packageResultsModal.classList.add('hidden');
    
    document.getElementById('propTitle').innerText = trip.hotelName;
    document.getElementById('propSubtitle').innerText = `${trip.destCode.toUpperCase()} • ${trip.stars} Star Property • ${trip.ratingScore} ${trip.ratingText}`;
    document.getElementById('propImageHero').style.backgroundImage = `url('${trip.image}')`;
    document.getElementById('propPrice').innerText = `$${Math.round(trip.bestPrice * 0.9).toLocaleString()} - $${Math.round(trip.bestPrice * 1.1).toLocaleString()}`;
    document.getElementById('propPrice').style.fontSize = "26px";

    
    let amenitiesHtml = trip.amenities.map(a => {
        if(a==='pool') return '<span style="background: rgba(255,255,255,0.1); padding: 6px 12px; border-radius: 20px; font-size: 13px;">🏊‍♂️ Swimming Pool</span>';
        if(a==='wifi') return '<span style="background: rgba(255,255,255,0.1); padding: 6px 12px; border-radius: 20px; font-size: 13px;">📶 Free High-Speed WiFi</span>';
        if(a==='view') return '<span style="background: rgba(255,255,255,0.1); padding: 6px 12px; border-radius: 20px; font-size: 13px;">🌅 Premium View</span>';
        if(a==='allinclusive') return '<span style="background: rgba(0,255,136,0.1); color: #00ff88; border: 1px solid #00ff88; padding: 6px 12px; border-radius: 20px; font-size: 13px;">🍽️ All Inclusive</span>';
        return '';
    }).join('');
    
    document.getElementById('propAmenities').innerHTML = amenitiesHtml;
    propertyDetailsModal.classList.remove('hidden');
}

if(propContinueBtn) {
    propContinueBtn.addEventListener('click', () => {
        propertyDetailsModal.classList.add('hidden');
        openBookingModal(currentSelectedTrip);
    });
}

// Booking Modal Logic
const bookingModal = document.getElementById('bookingModal');
const closeBookingModalBtn = document.getElementById('closeBookingModal');
const bookingRoute = document.getElementById('bookingRoute');
const bookingDuration = document.getElementById('bookingDuration');
const bookingStats = document.getElementById('bookingStats');

closeBookingModalBtn.addEventListener('click', () => {
    bookingModal.classList.add('hidden');
    if (currentSelectedTrip) {
        propertyDetailsModal.classList.remove('hidden');
    } else if (document.getElementById('packageListContent').innerHTML.trim() !== '') {
        packageResultsModal.classList.remove('hidden');
    }
});

function openBookingModal(trip) {
    bookingRoute.innerText = trip.hotelName || trip.route; 
    bookingDuration.innerText = `${trip.nights} Nights + Flight`;
    
    // Critical: define URL variables from the trip object
    const o = (trip.originCode || 'jfk').toLowerCase();
    const d = (trip.destCode || 'lhr').toLowerCase();
    const fallbackD1 = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
    const fallbackD2 = new Date(Date.now() + 21 * 86400000).toISOString().split('T')[0];
    const d1 = trip.departDate || fallbackD1;
    const d2 = trip.returnDate || fallbackD2;
    const pax = trip.passengers || '2';

    let providersHtml = '';

    trip.providers.forEach(p => {
        let url = "#";
        if(p.name === 'Expedia') url = `https://www.expedia.com/Flights?flight-search-type=RoundTrip&leg1=from:${o},to:${d},departure:${d1}&leg2=from:${d},to:${o},departure:${d2}&adults=${pax}`;
        if(p.name === 'Google Flights') url = `https://www.google.com/flights?hl=en#flt=${o}.${d}.${d1}*${d}.${o}.${d2};p:${pax}`;
        if(p.name === 'Kayak') url = `https://www.kayak.com/flights/${o}-${d}/${d1}/${d2}/${pax}adults`;
        if(p.name === 'Skyscanner') url = `https://www.skyscanner.com/transport/flights/${o}/${d}/${d1}/${d2}?adults=${pax}`;
        if(p.name === 'Booking.com') url = `https://flights.booking.com/flights/${o}-${d}/?depart=${d1}&return=${d2}&adults=${pax}`;
        if(p.name === 'Priceline') url = `https://www.priceline.com/flights/search/roundtrip/${o}/${d}/${d1}/${d2}/${pax}`;
        if(p.name === 'Agoda') url = `https://www.agoda.com/flights/search?origin=${o}&dest=${d}&depDate=${d1}&retDate=${d2}&adults=${pax}`;
        if(p.name === 'Orbitz') url = `https://www.orbitz.com/Flights?leg1=from:${o},to:${d},departure:${d1}&leg2=from:${d},to:${o},departure:${d2}&adults=${pax}`;

        providersHtml += `
            <div class="price-row" style="padding: 16px 0; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center;">
                    <span style="font-size: 16px; font-weight: 600;">${p.name}</span>
                    ${p.best ? '<span class="best-deal-badge" style="margin-left: 12px; background: rgba(0, 240, 255, 0.15); color: #00f0ff; padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(0,240,255,0.3); font-size: 11px;">Best Deal</span>' : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 20px;">
                    <div style="text-align: right;">
                        <span style="display: block; color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Estimated</span>
                        <span style="color: ${p.best ? 'var(--primary-color)' : 'var(--text-main)'}; font-size: 18px; font-weight: bold; font-family: 'Space Grotesk', sans-serif;">$${Math.round(p.price * 0.95).toLocaleString()} - $${Math.round(p.price * 1.05).toLocaleString()}</span>
                    </div>
                    <a href="${url}" target="_blank" onclick="event.stopPropagation();" style="background: ${p.best ? 'var(--primary-color)' : 'rgba(255,255,255,0.05)'}; color: ${p.best ? 'var(--bg-dark)' : 'white'}; padding: 10px 24px; border-radius: 8px; border: 1px solid ${p.best ? 'transparent' : 'rgba(255,255,255,0.1)'}; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block; transition: all 0.2s;">Book</a>
                </div>
            </div>
        `;
    });

    bookingStats.innerHTML = `
        <div class="flight-plan-details" style="background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); padding: 20px; border-radius: 16px; margin-bottom: 24px;">
            <div class="flight-plan-row" style="margin-bottom: 12px; display: flex; justify-content: space-between;"><span style="color:var(--text-muted);">Route</span><span style="font-weight:600;">${trip.originCode.toUpperCase()} ✈ ${trip.destCode.toUpperCase()}</span></div>
            <div class="flight-plan-row" style="margin-bottom: 12px; display: flex; justify-content: space-between;"><span style="color:var(--text-muted);">Dates</span><span style="font-weight:600;">${d1} to ${d2}</span></div>
            <div class="flight-plan-row" style="margin-bottom: 12px; display: flex; justify-content: space-between;"><span style="color:var(--text-muted);">Travelers</span><span style="font-weight:600;">${pax} Passengers</span></div>
            <div class="flight-plan-row" style="margin-bottom: 12px; display: flex; justify-content: space-between;"><span style="color:var(--text-muted);">Flight Number</span><span style="font-weight:600;">${trip.flightCode}</span></div>
            <div class="flight-plan-row" style="margin-bottom: 0; display: flex; justify-content: space-between;"><span style="color:var(--text-muted);">Cabin Class</span><span style="font-weight:600;">${trip.className}</span></div>
        </div>
        <div style="font-size: 18px; font-family: 'Space Grotesk', sans-serif; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1);">Select Provider</div>
        <div style="max-height: 350px; overflow-y: auto; padding-right: 12px;">
            ${providersHtml}
        </div>
    `;
    
    bookingModal.classList.remove('hidden');
}

// Close modals on outside click
document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
            // If they click out of propertyDetailsModal, reset the search entirely as requested
            if (modal.id === 'propertyDetailsModal') {
                const prm = document.getElementById('packageResultsModal');
                if (prm) prm.classList.add('hidden');
            }
        }
    });
});
