// How big things are drawn at each zoom, shared by every map theme. Modelled on Google Maps:
//  - roads keep shrinking as you zoom out (about half per zoom step), down to hairlines, instead of
//    stopping at a minimum width; small streets fade out and service lanes disappear
//  - road outlines (casings) only appear when zoomed in
//  - fewer, smaller labels when zoomed out: city names first, then areas, then neighbourhoods and streets
// Zooms are MapLibre zooms; the pixel map runs one below Google's (MapLibre 12 = Google 13).
// Exposes window.MapScale = { roadWidth, casingWidth, roadOpacity, casingOpacity, pathWidth, waterEdge,
//                             glowWidth, routeWidth, labels(colors) }.
(() => {
  // [zoom, main road, small street] widths in CSS px. Main = primary; small = minor (residential).
  const FILL = [[9, 0.8, 0.3], [11, 1.4, 0.6], [12, 2, 1], [13, 3.2, 1.6], [14, 5.5, 3], [15, 10, 6], [16, 18, 11], [18, 54, 32]];
  const CASING = [[12, 2, 1], [13, 4.4, 2.6], [14, 8, 4.8], [15, 13.5, 8.5], [16, 22, 14], [18, 64, 40]];

  // Per road class: highways a bit wider than primary, secondary a bit narrower, service lanes thin.
  const perClass = (main, small) => ['match', ['get', 'class'],
    ['motorway', 'trunk'], +(main * 1.15).toFixed(2), 'primary', main, 'secondary', +(main * 0.85).toFixed(2),
    'tertiary', +(small * 1.25).toFixed(2), 'service', +(small * 0.6).toFixed(2), small];
  // Zoom interpolation has to be the outermost expression, so the class choice sits inside each stop.
  const byZoom = (stops) => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops.flatMap(([z, a, b]) => [z, perClass(a, b)])];

  const roadWidth = () => byZoom(FILL);
  const casingWidth = () => byZoom(CASING);
  // Small streets fade in around Google zoom 13, service lanes around 14.5.
  const roadOpacity = () => ['interpolate', ['linear'], ['zoom'],
    11, ['match', ['get', 'class'], ['minor', 'service'], 0, 1],
    12, ['match', ['get', 'class'], 'minor', 0.75, 'service', 0, 1],
    13, ['match', ['get', 'class'], 'service', 0, 1],
    14, 1];
  const casingOpacity = () => ['interpolate', ['linear'], ['zoom'],
    12, 0, 13, ['match', ['get', 'class'], 'service', 0, 0.55], 14, 1];
  const pathWidth = () => ['interpolate', ['linear'], ['zoom'], 14, 1, 16, 2.5, 18, 3.5];
  const waterEdge = () => ['interpolate', ['linear'], ['zoom'], 11, 0.5, 14, 1.5, 16, 2];
  const glowWidth = () => ['interpolate', ['exponential', 1.6], ['zoom'], 11, 2, 13, 5, 15, 20, 18, 80];
  // Route lines: a, b, c are the widths at zoom 12, 15 and 18; thinner still when zoomed further out.
  const routeWidth = (a, b, c) => ['interpolate', ['linear'], ['zoom'],
    10, +(a * 0.45).toFixed(2), 12, +(a * 0.75).toFixed(2), 15, b, 18, c];

  const size = (...stops) => ['interpolate', ['linear'], ['zoom'], ...stops];
  const NAME = ['upcase', ['get', 'name']];

  // Label layers. 'water-name' must stay first: routes, trees and landmarks are inserted just below it.
  // c = { font, label, labelHalo, streetLabel, streetHalo, waterHalo, parkHalo, letterSpacing }
  function labels(c) {
    const font = c.font, ls = c.letterSpacing || 0;
    const place = (id, classes, minzoom, textSize, halo) => ({
      id, type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom,
      filter: ['in', ['get', 'class'], ['literal', classes]],
      layout: { 'text-field': NAME, 'text-font': font, 'text-size': textSize, 'text-letter-spacing': ls,
                'symbol-sort-key': ['coalesce', ['get', 'rank'], 99], 'text-padding': 4 },
      paint: { 'text-color': c.label, 'text-halo-color': c.labelHalo, 'text-halo-width': halo },
    });
    return [
      { id: 'water-name', type: 'symbol', source: 'omt', 'source-layer': 'water_name', minzoom: 11,
        layout: { 'text-field': NAME, 'text-font': font, 'text-size': size(11, 9, 14, 12, 16, 15), 'text-letter-spacing': ls },
        paint: { 'text-color': '#ffffff', 'text-halo-color': c.waterHalo, 'text-halo-width': 1.6 } },
      { id: 'street-name-major', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 12.5,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
        layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': font,
                  'text-size': size(12.5, 9, 15, 11, 17, 13), 'text-letter-spacing': ls },
        paint: { 'text-color': c.streetLabel, 'text-halo-color': c.streetHalo, 'text-halo-width': 1.6 } },
      { id: 'street-name', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 14.5,
        filter: ['in', ['get', 'class'], ['literal', ['tertiary', 'minor']]],
        layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': font,
                  'text-size': size(14.5, 9, 17, 13), 'text-letter-spacing': ls },
        paint: { 'text-color': c.streetLabel, 'text-halo-color': c.streetHalo, 'text-halo-width': 1.6 } },
      { id: 'park-name', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 13,
        filter: ['==', ['get', 'class'], 'park'],
        layout: { 'text-field': NAME, 'text-font': font, 'text-size': size(13, 9, 15, 12, 17, 15), 'text-letter-spacing': ls,
                  'symbol-sort-key': ['coalesce', ['get', 'rank'], 99] },
        paint: { 'text-color': '#ffffff', 'text-halo-color': c.parkHalo, 'text-halo-width': 1.8 } },
      place('place-small', ['neighbourhood', 'hamlet', 'isolated_dwelling'], 14.5, size(14.5, 9, 17, 13), 1.8),
      place('place-quarter', ['quarter', 'village'], 13, size(13, 9, 15, 12, 17, 14), 1.8),
      place('place-suburb', ['suburb'], 11, size(11, 9, 13, 11, 15, 14, 17, 16), 2),
      place('place-name', ['city', 'town'], 0, size(9, 12, 12, 15, 15, 18, 17, 20), 2.5),
    ];
  }

  window.MapScale = { roadWidth, casingWidth, roadOpacity, casingOpacity, pathWidth, waterEdge, glowWidth, routeWidth, labels };
})();
