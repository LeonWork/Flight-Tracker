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
