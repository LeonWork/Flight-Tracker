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

