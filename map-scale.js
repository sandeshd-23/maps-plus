// How big things are drawn at each zoom, shared by every map theme. Modelled on Google Maps:
//  - roads keep shrinking as you zoom out (about half per zoom step), down to hairlines, instead of
//    stopping at a minimum width; small streets fade out and service lanes disappear
//  - road outlines (casings) only appear when zoomed in, EXCEPT highways and main roads: zoomed out to city /
//    state level those stay bold (gold highways, cream main roads, dark outline) so you can follow them,
//    (the yellow NH number plates on top are placed by game-overlay.html: updateShields)
//  - fewer, smaller labels when zoomed out: city names first, then areas, then neighbourhoods and streets
// Zooms are MapLibre zooms; the pixel map runs one below Google's (MapLibre 12 = Google 13).
// Exposes window.MapScale = { roadWidth, casingWidth, roadOpacity, casingOpacity, casingColor(base), roadColor(other),
//                             HIGHWAY, MAIN_ROAD, pathWidth, waterEdge, glowWidth, routeWidth, labels(colors) }.
(() => {
  // [zoom, highway, main road, small street] widths in CSS px. Highway = motorway/trunk (NH, ring roads),
  // main = primary, small = minor (residential). Highways stay clearly visible down to state level.
  const FILL = [[5, 1.6, 0.6, 0.2], [8, 2.4, 0.9, 0.3], [9, 2.8, 1.1, 0.3], [11, 3.4, 1.9, 0.6], [12, 3.9, 2.4, 1],
                [13, 4.8, 3.4, 1.6], [14, 6.5, 5.5, 3], [15, 11, 10, 6], [16, 20, 18, 11], [18, 60, 54, 32]];
  // Zoomed far out, main roads get only a hairline outline so they read as light lines and highways dominate.
  const CASING = [[5, 3, 1.1, 0], [8, 4, 1.5, 0], [9, 4.4, 1.8, 0], [11, 5.3, 3.2, 1], [12, 5.9, 4.2, 1.6],
                  [13, 7, 5.4, 2.6], [14, 9, 8, 4.8], [15, 14.5, 13.5, 8.5], [16, 24, 22, 14], [18, 70, 64, 40]];
  // Zoomed-out colours (below street level, where the pixel road textures take over).
  const HIGHWAY = '#f3c341', MAIN_ROAD = '#fbf0cc', OUTLINE = '#3a2c22';

  // Per road class: secondary a bit narrower than primary, tertiary a bit wider than minor, service lanes thin.
  const perClass = (hw, main, small) => ['match', ['get', 'class'],
    ['motorway', 'trunk'], hw, 'primary', main, 'secondary', +(main * 0.8).toFixed(2),
    'tertiary', +(small * 1.25).toFixed(2), 'service', +(small * 0.6).toFixed(2), small];
  // Zoom interpolation has to be the outermost expression, so the class choice sits inside each stop.
  const byZoom = (stops) => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops.flatMap(([z, h, a, b]) => [z, perClass(h, a, b)])];
  // Fill colour: gold highways, cream main roads, `other` for the rest.
  const roadColor = (other) => ['match', ['get', 'class'], ['motorway', 'trunk'], HIGHWAY, 'primary', MAIN_ROAD, other];
  // Outline colour: dark when zoomed out (so roads pop on grass), the theme's own colour up close.
  const casingColor = (base) => ['interpolate', ['linear'], ['zoom'], 13, OUTLINE, 14, base];

  const roadWidth = () => byZoom(FILL);
  const casingWidth = () => byZoom(CASING);
  // Small streets fade in around Google zoom 13, service lanes around 14.5.
  const roadOpacity = () => ['interpolate', ['linear'], ['zoom'],
    8, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 1, 0],
    9, ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], 1, 'secondary', 0.6, 0],
    10, ['match', ['get', 'class'], ['minor', 'service'], 0, 'tertiary', 0.5, 1],
    11, ['match', ['get', 'class'], ['minor', 'service'], 0, 1],
    12, ['match', ['get', 'class'], 'minor', 0.75, 'service', 0, 1],
    13, ['match', ['get', 'class'], 'service', 0, 1],
    14, 1];
  const MAJOR3 = ['motorway', 'trunk', 'primary'];
  const casingOpacity = () => ['interpolate', ['linear'], ['zoom'],
    9, ['match', ['get', 'class'], MAJOR3, 0.95, 0],
    11, ['match', ['get', 'class'], MAJOR3, 0.95, 'secondary', 0.5, 0],
    12, ['match', ['get', 'class'], MAJOR3, 0.95, 'secondary', 0.7, 0],
    13, ['match', ['get', 'class'], MAJOR3, 0.95, 'service', 0, 0.55], 14, 1];
  const pathWidth = () => ['interpolate', ['linear'], ['zoom'], 14, 1, 16, 2.5, 18, 3.5];
  const waterEdge = () => ['interpolate', ['linear'], ['zoom'], 11, 0.5, 14, 1.5, 16, 2];
  const glowWidth = () => ['interpolate', ['exponential', 1.6], ['zoom'], 11, 2, 13, 5, 15, 20, 18, 80];
  // Route lines: a, b, c are the widths at zoom 12, 15 and 18; thinner still when zoomed further out.
  const routeWidth = (a, b, c) => ['interpolate', ['linear'], ['zoom'],
    10, +(a * 0.45).toFixed(2), 12, +(a * 0.75).toFixed(2), 15, b, 18, c];

  const size = (...stops) => ['interpolate', ['linear'], ['zoom'], ...stops];
  const NAME = ['upcase', ['coalesce', ['get', 'name'], '']];

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

  window.MapScale = { roadWidth, casingWidth, roadOpacity, casingOpacity, casingColor, roadColor, HIGHWAY, MAIN_ROAD,
                      pathWidth, waterEdge, glowWidth, routeWidth, labels };
})();
