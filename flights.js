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

