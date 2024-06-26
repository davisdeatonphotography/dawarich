import { Controller } from "@hotwired/stimulus";
import L from "leaflet";
import "leaflet.heat";

export default class extends Controller {
  static targets = ["container"];

  connect() {
    console.log("Map controller connected");

    const markers = JSON.parse(this.element.dataset.coordinates);
    let center = markers[markers.length - 1] || JSON.parse(this.element.dataset.center);
    center = center === undefined ? [52.514568, 13.350111] : center;
    const timezone = this.element.dataset.timezone;
    const clearFogRadius = this.element.dataset.fog_of_war_meters;

    const map = L.map(this.containerTarget, {
      layers: [this.osmMapLayer(), this.osmHotMapLayer()],
    }).setView([center[0], center[1]], 14);

    const markersArray = this.createMarkersArray(markers);
    const markersLayer = L.layerGroup(markersArray);
    const heatmapMarkers = markers.map((element) => [element[0], element[1], 0.3]);

    const polylinesLayer = this.createPolylinesLayer(markers, map, timezone);
    const heatmapLayer = L.heatLayer(heatmapMarkers, { radius: 20 }).addTo(map);
    const fogOverlay = L.layerGroup(); // Initialize fog layer
    const controlsLayer = {
      Points: markersLayer,
      Polylines: polylinesLayer,
      Heatmap: heatmapLayer,
      "Fog of War": fogOverlay
    };

    L.control
      .scale({
        position: "bottomright",
        metric: true,
        imperial: false,
        maxWidth: 120,
      })
      .addTo(map);

    const layerControl = L.control.layers(this.baseMaps(), controlsLayer).addTo(map);

    let fogEnabled = false;

    // Hide fog by default
    document.getElementById('fog').style.display = 'none';

    // Toggle fog layer visibility
    map.on('overlayadd', function(e) {
      if (e.name === 'Fog of War') {
        fogEnabled = true;
        document.getElementById('fog').style.display = 'block';
        updateFog(markers, clearFogRadius);
      }
    });

    map.on('overlayremove', function(e) {
      if (e.name === 'Fog of War') {
        fogEnabled = false;
        document.getElementById('fog').style.display = 'none';
      }
    });

    // Update fog circles on zoom and move
    map.on('zoomend moveend', function() {
      if (fogEnabled) {
        updateFog(markers, clearFogRadius);
      }
    });

    function updateFog(markers, clearFogRadius) {
      if (fogEnabled) {
        var fog = document.getElementById('fog');
        fog.innerHTML = ''; // Clear previous circles
        markers.forEach(function(point) {
          const radiusInPixels = metersToPixels(map, clearFogRadius);
          clearFog(point[0], point[1], radiusInPixels);
        });
      }
    }

    function metersToPixels(map, meters) {
      const zoom = map.getZoom();
      const latLng = map.getCenter(); // Get map center for correct projection
      const metersPerPixel = getMetersPerPixel(latLng.lat, zoom);
      return meters / metersPerPixel;
    }

    function getMetersPerPixel(latitude, zoom) {
      // Might be a total bullshit, generated by ChatGPT, but works
      const earthCircumference = 40075016.686; // Earth's circumference in meters
      const metersPerPixel = earthCircumference * Math.cos(latitude * Math.PI / 180) / Math.pow(2, zoom + 8);
      return metersPerPixel;
    }

    function clearFog(lat, lng, radius) {
      var fog = document.getElementById('fog');
      var point = map.latLngToContainerPoint([lat, lng]);
      var size = radius * 2;
      var circle = document.createElement('div');
      circle.className = 'unfogged-circle';
      circle.style.width = size + 'px';
      circle.style.height = size + 'px';
      circle.style.left = (point.x - radius) + 'px';
      circle.style.top = (point.y - radius) + 'px';
      circle.style.backdropFilter = 'blur(0px)'; // Remove blur for the circles
      fog.appendChild(circle);
    }

    this.addTileLayer(map);
    this.addLastMarker(map, markers);
  }

  disconnect() {
    this.map.remove();
  }

  osmMapLayer() {
    return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    });
  }

  osmHotMapLayer() {
    return L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors, Tiles style by Humanitarian OpenStreetMap Team hosted by OpenStreetMap France",
    });
  }

  baseMaps() {
    return {
      OpenStreetMap: this.osmMapLayer(),
      "OpenStreetMap.HOT": this.osmHotMapLayer()
    };
  }

  createMarkersArray(markersData) {
    return markersData.map((marker) => {
      const [lat, lon] = marker;
      const popupContent = this.createPopupContent(marker);
      return L.circleMarker([lat, lon], { radius: 4 }).bindPopup(popupContent);
    });
  }

  createPopupContent(marker) {
    return `
      <b>Timestamp:</b> ${this.formatDate(marker[4])}<br>
      <b>Latitude:</b> ${marker[0]}<br>
      <b>Longitude:</b> ${marker[1]}<br>
      <b>Altitude:</b> ${marker[3]}m<br>
      <b>Velocity:</b> ${marker[5]}km/h<br>
      <b>Battery:</b> ${marker[2]}%
    `;
  }

  formatDate(timestamp) {
    const date = new Date(timestamp * 1000);
    const timezone = this.element.dataset.timezone;
    return date.toLocaleString("en-GB", { timeZone: timezone });
  }

  addTileLayer(map) {
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; <a href='http://www.openstreetmap.org/copyright'>OpenStreetMap</a>",
    }).addTo(map);
  }

  addLastMarker(map, markers) {
    if (markers.length > 0) {
      const lastMarker = markers[markers.length - 1].slice(0, 2);
      L.marker(lastMarker).addTo(map);
    }
  }

  haversineDistance(lat1, lon1, lat2, lon2) {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000; // Distance in meters
  }

  minutesToDaysHoursMinutes(minutes) {
    const days = Math.floor(minutes / (24 * 60));
    const hours = Math.floor((minutes % (24 * 60)) / 60);
    minutes = minutes % 60;
    let result = "";

    if (days > 0) {
      result += `${days}d `;
    }

    if (hours > 0) {
      result += `${hours}h `;
    }

    if (minutes > 0) {
      result += `${minutes}min`;
    }

    return result;
  }

  getUrlParameter(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  addHighlightOnHover(polyline, map, startPoint, endPoint, prevPoint, nextPoint, timezone) {
    const originalStyle = { color: "blue", opacity: 0.6, weight: 3 };
    const highlightStyle = { color: "yellow", opacity: 1, weight: 5 };

    polyline.setStyle(originalStyle);

    const firstTimestamp = new Date(startPoint[4] * 1000).toLocaleString("en-GB", { timeZone: timezone });
    const lastTimestamp = new Date(endPoint[4] * 1000).toLocaleString("en-GB", { timeZone: timezone });

    const minutes = Math.round((endPoint[4] - startPoint[4]) / 60);
    const timeOnRoute = this.minutesToDaysHoursMinutes(minutes);
    const distance = this.haversineDistance(startPoint[0], startPoint[1], endPoint[0], endPoint[1]);

    const distanceToPrev = prevPoint ? this.haversineDistance(prevPoint[0], prevPoint[1], startPoint[0], startPoint[1]) : "N/A";
    const distanceToNext = nextPoint ? this.haversineDistance(endPoint[0], endPoint[1], nextPoint[0], nextPoint[1]) : "N/A";

    const timeBetweenPrev = prevPoint ? Math.round((startPoint[4] - prevPoint[4]) / 60) : "N/A";
    const timeBetweenNext = nextPoint ? Math.round((nextPoint[4] - endPoint[4]) / 60) : "N/A";

    const startIcon = L.divIcon({ html: "🚥", className: "emoji-icon" });
    const finishIcon = L.divIcon({ html: "🏁", className: "emoji-icon" });

    const isDebugMode = this.getUrlParameter("debug") === "true";

    let popupContent = `
      <b>Start:</b> ${firstTimestamp}<br>
      <b>End:</b> ${lastTimestamp}<br>
      <b>Duration:</b> ${timeOnRoute}<br>
      <b>Distance:</b> ${Math.round(distance)}m<br>
    `;

    if (isDebugMode) {
      popupContent += `
        <b>Prev Route:</b> ${Math.round(distanceToPrev)}m and ${this.minutesToDaysHoursMinutes(timeBetweenPrev)} away<br>
        <b>Next Route:</b> ${Math.round(distanceToNext)}m and ${this.minutesToDaysHoursMinutes(timeBetweenNext)} away<br>
      `;
    }

    const startMarker = L.marker([startPoint[0], startPoint[1]], { icon: startIcon }).bindPopup(`Start: ${firstTimestamp}`);
    const endMarker = L.marker([endPoint[0], endPoint[1]], { icon: finishIcon }).bindPopup(popupContent);

    polyline.on("mouseover", function () {
      polyline.setStyle(highlightStyle);
      startMarker.addTo(map);
      endMarker.addTo(map).openPopup();
    });

    polyline.on("mouseout", function () {
      polyline.setStyle(originalStyle);
      map.closePopup();
      map.removeLayer(startMarker);
      map.removeLayer(endMarker);
    });
  }

  createPolylinesLayer(markers, map, timezone) {
    const splitPolylines = [];
    let currentPolyline = [];
    const distanceThresholdMeters = parseInt(this.element.dataset.meters_between_routes) || 500;
    const timeThresholdMinutes = parseInt(this.element.dataset.minutes_between_routes) || 60;

    for (let i = 0, len = markers.length; i < len; i++) {
      if (currentPolyline.length === 0) {
        currentPolyline.push(markers[i]);
      } else {
        const lastPoint = currentPolyline[currentPolyline.length - 1];
        const currentPoint = markers[i];
        const distance = this.haversineDistance(lastPoint[0], lastPoint[1], currentPoint[0], currentPoint[1]);
        const timeDifference = (currentPoint[4] - lastPoint[4]) / 60;

        if (distance > distanceThresholdMeters || timeDifference > timeThresholdMinutes) {
          splitPolylines.push([...currentPolyline]);
          currentPolyline = [currentPoint];
        } else {
          currentPolyline.push(currentPoint);
        }
      }
    }

    if (currentPolyline.length > 0) {
      splitPolylines.push(currentPolyline);
    }

    return L.layerGroup(
      splitPolylines.map((polylineCoordinates, index) => {
        const latLngs = polylineCoordinates.map((point) => [point[0], point[1]]);
        const polyline = L.polyline(latLngs, { color: "blue", opacity: 0.6, weight: 3 });

        const startPoint = polylineCoordinates[0];
        const endPoint = polylineCoordinates[polylineCoordinates.length - 1];
        const prevPoint = index > 0 ? splitPolylines[index - 1][splitPolylines[index - 1].length - 1] : null;
        const nextPoint = index < splitPolylines.length - 1 ? splitPolylines[index + 1][0] : null;

        this.addHighlightOnHover(polyline, map, startPoint, endPoint, prevPoint, nextPoint, timezone);

        return polyline;
      })
    ).addTo(map);
  }
}
