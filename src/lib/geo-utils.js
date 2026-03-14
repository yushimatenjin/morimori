export class GeoUtils {
  static lon2tile(lon, zoom) {
    return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
  }

  static lat2tile(lat, zoom) {
    return Math.floor(
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
        Math.pow(2, zoom)
    );
  }

  static tile2lon(x, zoom) {
    return (x / Math.pow(2, zoom)) * 360 - 180;
  }

  static tile2lat(y, zoom) {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  static getMetersPerDegree(lat) {
    const latRad = (lat * Math.PI) / 180;
    return {
      lat: 111132.92 - 559.82 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad),
      lon: 111412.84 * Math.cos(latRad) - 93.5 * Math.cos(3 * latRad)
    };
  }

  static calculateBounds(lat, lng, widthKm, heightKm) {
    const metersPerDegree = this.getMetersPerDegree(lat);
    const latDiff = ((heightKm * 1000) / metersPerDegree.lat) / 2;
    const lngDiff = ((widthKm * 1000) / metersPerDegree.lon) / 2;

    return {
      north: lat + latDiff,
      south: lat - latDiff,
      west: lng - lngDiff,
      east: lng + lngDiff
    };
  }
}
