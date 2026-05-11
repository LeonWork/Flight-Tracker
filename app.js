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

// Initialize MapLibre Map (Using Carto Dark Matter style for a premium dark look)
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [0, 20], // Centered globally
    zoom: 2, // Fully zoomed out initially
    pitch: 0, 
    bearing: 0,
    antialias: true
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
        
        // Generate 150 mock live flights spread globally
        const mockStates = [];
        for (let i = 0; i < 150; i++) {
            const lng = -180 + Math.random() * 360; // Global longitude
            const lat = -60 + Math.random() * 130;  // Global latitude (avoiding extreme poles)
            const heading = Math.random() * 360;
            const alt = 8000 + Math.random() * 4000;
            const velocity = 200 + Math.random() * 100; // m/s
            const callsign = 'FLT' + Math.floor(Math.random() * 9000 + 1000);
            const countries = ['United States', 'Canada', 'Germany', 'France', 'United Kingdom', 'Italy', 'Spain', 'Japan', 'Australia', 'Brazil', 'UAE', 'Singapore'];
            const country = countries[Math.floor(Math.random() * countries.length)];
            
            // Format: [id, callsign, country, time, time, lng, lat, alt, onGround, velocity, heading]
            mockStates.push([
                `live_mock_${i}`, callsign, country, 0, 0, lng, lat, alt, false, velocity, heading
            ]);
        }
        
        liveFlightsData = mockStates.map(f => {
            // Generate a random progress and flight duration for each plane
            const progress = 10 + Math.random() * 80;
            const durationMins = 60 + Math.floor(Math.random() * 300);
            const timeLeft = Math.floor(durationMins * ((100 - progress) / 100));
            const airports = ['JFK', 'LHR', 'HND', 'CDG', 'FRA', 'DXB', 'LAX', 'YYZ', 'AMS', 'SYD'];
            let origin = airports[Math.floor(Math.random() * airports.length)];
            let dest = airports[Math.floor(Math.random() * airports.length)];
            if(origin === dest) dest = 'SIN'; // quick fix
            
            return {
                id: f[0], callsign: f[1], country: f[2], lng: f[5], lat: f[6], alt: f[7], velocity: f[9], heading: f[10],
                origin: origin, dest: dest, depTime: 'In Air', arrTime: `${Math.floor(timeLeft/60)}h ${timeLeft%60}m left`, progress: progress
            }
        });

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

        if (markers[id]) {
            // Update existing
            markers[id].setLngLat([lng, lat]);
            markers[id].getElement().style.transform = `rotate(${heading}deg)`;
            
            if (id === selectedFlightId) {
                update3DModelPosition([lng, lat], alt, heading);
            }
        } else {
            // Create new marker
            const el = document.createElement('div');
            el.className = 'plane-marker';
            el.style.transform = `rotate(${heading}deg)`;
            if (isRouteSearch) {
                el.style.filter = "hue-rotate(90deg)"; // Make searched flights a different color (greenish)
            }
            
            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([lng, lat])
                .addTo(map);
                
            // Click event
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
    const dt = (now - lastTime) / 1000; // seconds
    lastTime = now;

    const dataToAnimate = isMockMode ? mockFlightsData : (liveTrafficToggle.checked ? liveFlightsData : []);

    dataToAnimate.forEach(f => {
        // velocity is in m/s. Approximate degree conversion at equator
        const speedDegreesPerSecond = (f.velocity / 111000); 
        
        // Update coordinates based on heading
        const rad = (90 - f.heading) * (Math.PI / 180);
        f.lng += Math.cos(rad) * speedDegreesPerSecond * dt;
        f.lat += Math.sin(rad) * speedDegreesPerSecond * dt;
        
        // Wrap around globe
        if (f.lng > 180) f.lng -= 360;
        if (f.lng < -180) f.lng += 360;
        
        // Update progress slightly
        if (f.progress) {
            f.progress += 0.005 * dt;
            if (f.progress > 100) f.progress = 100;
        }
    });

    updateMapMarkers(dataToAnimate, isMockMode);
    
    // Smoothly pan camera to follow selected flight
    if (selectedFlightId && map.getLayer('3d-model')) {
        const sf = dataToAnimate.find(f => f.id === selectedFlightId);
        if (sf) {
            // map.setCenter([sf.lng, sf.lat]); // Optional: strictly lock camera
        }
    }
}

function selectFlight(id, data) {
    selectedFlightId = id;
    
    // Fly to the plane
    map.flyTo({
        center: [data.lng, data.lat],
        zoom: 12,
        pitch: 60,
        bearing: data.heading,
        speed: 1.5
    });

    updateFlightPanel(data);
    flightPanel.classList.add('active');
    
    // Create or update 3D model layer
    setup3DModel([data.lng, data.lat], data.alt, data.heading);
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
                <div class="progress-bar" style="width: ${progress}%"></div>
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
                <div class="detail-val">${Math.round(data.alt)} m</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Speed</div>
                <div class="detail-val">${Math.round(data.velocity * 3.6)} km/h</div>
            </div>
        </div>
    `;
}

closePanelBtn.addEventListener('click', () => {
    flightPanel.classList.remove('active');
    selectedFlightId = null;
    if (map.getLayer('3d-model')) {
        map.removeLayer('3d-model');
    }
    
    // Automatically reset position on the globe
    map.flyTo({
        center: [0, 20],
        zoom: 2,
        pitch: 0,
        bearing: 0,
        speed: 1.2
    });
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

    // Create 3 mock flights for this route
    mockFlightsData = [
        { id: 'mock1', callsign: 'WJA992', country: 'Canada', lng: -50, lat: 55, alt: 10500, velocity: 240, heading: 95, origin, dest, depTime: '08:30 AM', arrTime: '11:45 PM', progress: 40 },
        { id: 'mock2', callsign: 'ACA834', country: 'Canada', lng: -30, lat: 58, alt: 11000, velocity: 250, heading: 100, origin, dest, depTime: '10:00 AM', arrTime: '01:15 AM', progress: 65 },
        { id: 'mock3', callsign: 'RYR12', country: 'Italy', lng: -10, lat: 50, alt: 9500, velocity: 230, heading: 110, origin, dest, depTime: '01:00 PM', arrTime: '04:30 AM', progress: 85 }
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
            
            // Sleek Metallic Material
            const metalMaterial = new THREE.MeshPhysicalMaterial({ 
                color: 0xeeeeee, 
                metalness: 0.8, 
                roughness: 0.2,
                clearcoat: 1.0,
                clearcoatRoughness: 0.1
            });
            
            // Dark Glass Material for Cockpit
            const glassMaterial = new THREE.MeshPhysicalMaterial({
                color: 0x111111,
                metalness: 0.9,
                roughness: 0.1,
                transparent: true,
                opacity: 0.9
            });
            
            // Accent Material
            const accentMaterial = new THREE.MeshPhysicalMaterial({ color: 0x00f0ff, metalness: 0.5, roughness: 0.2 });

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
            const spotLight = new THREE.SpotLight(0x00f0ff, 50);
            spotLight.position.set(0, -2, 0);
            spotLight.angle = Math.PI / 6;
            spotLight.penumbra = 0.5;
            spotLight.target.position.set(0, -100, 0);
            planeGroup.add(spotLight);
            planeGroup.add(spotLight.target);

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
    const modelAltitude = altitude || 10000;
    const mercatorCoordinate = maplibregl.MercatorCoordinate.fromLngLat(
        lngLat,
        modelAltitude
    );

    // Scale depends on latitude
    const modelScale = mercatorCoordinate.meterInMercatorCoordinateUnits() * 50; // Scale up for visibility

    modelTransform.translateX = mercatorCoordinate.x;
    modelTransform.translateY = mercatorCoordinate.y;
    modelTransform.translateZ = mercatorCoordinate.z;
    // Rotate to match heading. Three.js rotation requires some math to match map bearing
    modelTransform.rotateZ = (-heading * Math.PI) / 180;
    modelTransform.scale = modelScale;
}
