// =====================================================================
// NDVI CROP MONITORING - Bhelchaur, Baglung Municipality-4,Baglung, NEPAL (Sentinel-2, Google Earth Engine)
// Run in the Code Editor: https://code.earthengine.google.com/2f219cdd4ce33d78bb7701ba5dcd5723
// =====================================================================

// ---------------------------------------------------------------------
// 1. STUDY AREA (AOI)
// One farmland polygon of about 13.5 ha .
// Hard-coded here so the script runs without any map imports.
// Everything below is clipped/summarised to this geometry.
// ---------------------------------------------------------------------
var aoi = ee.Geometry.Polygon([[
  [83.58967039040598, 28.297128752165037],
  [83.589852780619, 28.29676032819689],
  [83.59026047638926, 28.29659973273472],
  [83.59023901871714, 28.296354115676728],
  [83.59006735734019, 28.29608015752027],
  [83.5899064247993, 28.29600458273232],
  [83.589852780619, 28.295381088683968],
  [83.58982059411082, 28.295277172654117],
  [83.59013173035655, 28.295201597295954],
  [83.5904643242744, 28.29518270344804],
  [83.59095785073313, 28.295220491140544],
  [83.5913119023231, 28.29519215037242],
  [83.59154793671641, 28.294984317842353],
  [83.59177324227366, 28.294965423955837],
  [83.5919234459785, 28.295362194867906],
  [83.59193417481455, 28.295636154872497],
  [83.59211656502757, 28.295645601756622],
  [83.59252426079783, 28.29589122044975],
  [83.5932216351417, 28.296193519601577],
  [83.5937795346168, 28.296269094255383],
  [83.59425160340342, 28.29616517909258],
  [83.59475585869822, 28.296014029583723],
  [83.59510991028819, 28.295957348462576],
  [83.59558197907481, 28.29598568902694],
  [83.59598967484507, 28.296089604364983],
  [83.59611842087779, 28.296259647426574],
  [83.5961935227302, 28.296524158315712],
  [83.59598967484507, 28.29676032819689],
  [83.59576436928782, 28.29693037018684],
  [83.59532448700938, 28.297053178121693],
  [83.59486314705882, 28.297336580507483],
  [83.59446618012461, 28.297733342579644],
  [83.59410139969859, 28.298356822847293],
  [83.5938331787971, 28.298781920935394],
  [83.59357568673167, 28.29877247432968],
  [83.59309288910899, 28.298725241288423],
  [83.5928246682075, 28.298838600552187],
  [83.59253498963389, 28.298668561611272],
  [83.59220239571604, 28.298356822847293],
  [83.59174105576548, 28.298035636498927],
  [83.59135481766734, 28.297601088719944],
  [83.59101149491343, 28.29721377289964],
  [83.59062525681529, 28.29679811532926],
  [83.59029266289744, 28.29693037018684]
]]);

Map.centerObject(aoi, 17);
Map.setOptions('SATELLITE');

// Sanity check: area of the AOI in hectares (expected: about 13.5)
print('AOI area (hectares):', aoi.area().divide(10000));
Map.addLayer(aoi, {color: 'red'}, 'AOI outline', false);

// ---------------------------------------------------------------------
// 2. SENTINEL-2 COLLECTION (2025)
// Surface reflectance, images covering the AOI, tile cloud cover < 60%.
// ---------------------------------------------------------------------
var start = '2025-01-01', end = '2025-12-31';

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi)
  .filterDate(start, end)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 60));

// ---------------------------------------------------------------------
// 3. CLOUD MASKING (Cloud Score+)
// cs_cdf is a per-pixel clarity score from 0 (cloud) to 1 (clear).
// Pixels below CLEAR_THRESHOLD are masked out.
// ---------------------------------------------------------------------
var csPlus = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');
var QA_BAND = 'cs_cdf';
var CLEAR_THRESHOLD = 0.6;

var masked = s2
  .linkCollection(csPlus, [QA_BAND])
  .map(function(img) {
    return img.updateMask(img.select(QA_BAND).gte(CLEAR_THRESHOLD));
  });

// ---------------------------------------------------------------------
// 4. NDVI = (NIR - Red) / (NIR + Red), Sentinel-2 bands B8 and B4 (10 m)
// ---------------------------------------------------------------------
var addNDVI = function(img) {
  var ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI');
  return img.addBands(ndvi);
};
var withNDVI = masked.map(addNDVI);   // 2025 cloud-masked images with NDVI

// ---------------------------------------------------------------------
// 5. MEDIAN NDVI MAP (whole of 2025)
// ---------------------------------------------------------------------
var ndviPalette = ['#d73027', '#fc8d59', '#fee08b', '#d9ef8b', '#91cf60', '#1a9850'];
var median = withNDVI.select('NDVI').median().clip(aoi);
Map.addLayer(median, {min: 0, max: 0.9, palette: ndviPalette}, 'Median NDVI 2025');

// ---------------------------------------------------------------------
// 6. NDVI TIME SERIES (every clear image)
// Mean NDVI over the AOI per image date. Gaps = monsoon clouds.
// ---------------------------------------------------------------------
print(ui.Chart.image.series({
  imageCollection: withNDVI.select('NDVI'),
  region: aoi,
  reducer: ee.Reducer.mean(),
  scale: 10
}).setOptions({
  title: 'Mean NDVI over time, 2025',
  vAxis: {title: 'NDVI'},
  lineWidth: 1, pointSize: 3
}));

// ---------------------------------------------------------------------
// 7. MONTHLY COMPOSITES
// Median of all clear images in each month; one image per month.
// This fills cloud gaps and gives a smooth seasonal curve.
// ---------------------------------------------------------------------
var months = ee.List.sequence(1, 12);
var monthly = ee.ImageCollection.fromImages(
  months.map(function(m) {
    var img = withNDVI.filter(ee.Filter.calendarRange(m, m, 'month'))
      .select('NDVI').median();
    return img.set('month', m).set('system:time_start',
      ee.Date.fromYMD(2025, m, 1).millis());
  })
);

print(ui.Chart.image.series({
  imageCollection: monthly,
  region: aoi,
  reducer: ee.Reducer.mean(),
  scale: 10
}).setOptions({
  title: 'Monthly median NDVI, 2025',
  vAxis: {title: 'NDVI', viewWindow: {min: 0, max: 1}},
  hAxis: {title: 'Month'},
  lineWidth: 2, pointSize: 5,
  legend: {position: 'none'}
}));

// ---------------------------------------------------------------------
// 8. MULTI-YEAR COLLECTION (no date filter)
// Same masking and NDVI, used to compare different years and months.
// ---------------------------------------------------------------------
var s2all = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 60))
  .linkCollection(csPlus, [QA_BAND])
  .map(function(img) {
    return img.updateMask(img.select(QA_BAND).gte(CLEAR_THRESHOLD));
  })
  .map(addNDVI);

// ---------------------------------------------------------------------
// 9. YEAR-ON-YEAR ANOMALY: SEPTEMBER 2025 minus SEPTEMBER 2024
// Green = higher NDVI than 2024, red = lower, white = little change.
// ---------------------------------------------------------------------
var sep2025 = s2all.filterDate('2025-09-01', '2025-10-01').select('NDVI').median();
var sep2024 = s2all.filterDate('2024-09-01', '2024-10-01').select('NDVI').median();
var anomaly = sep2025.subtract(sep2024).clip(aoi);

Map.addLayer(anomaly, {min: -0.3, max: 0.3, palette: ['red', 'white', 'green']},
  'NDVI anomaly Sep 2025 vs Sep 2024', false);

print('Mean anomaly (Sep 2025 - Sep 2024):', anomaly.reduceRegion({
  reducer: ee.Reducer.mean(), geometry: aoi, scale: 10
}));

// ---------------------------------------------------------------------
// 10. JUNE vs SEPTEMBER COMPARISON
// ---------------------------------------------------------------------

// 10a. Median NDVI image for any date range, clipped to the AOI
function ndviMedian(startDate, endDate) {
  return s2all.filterDate(startDate, endDate).select('NDVI').median().clip(aoi);
}
var june = ndviMedian('2025-06-01', '2025-07-01');
var sep  = ndviMedian('2025-09-01', '2025-10-01');

// 10b. Classes: 1 = poor (<0.5), 2 = moderate (0.5 to 0.75), 3 = healthy (>=0.75)
// NOTE: thresholds are illustrative, not calibrated against field data.
function classify(img) {
  return ee.Image(0)
    .where(img.lt(0.5), 1)
    .where(img.gte(0.5).and(img.lt(0.75)), 2)
    .where(img.gte(0.75), 3)
    .updateMask(img.mask())
    .clip(aoi);
}
var classJune = classify(june);
var classSep  = classify(sep);

// 10c. Class maps (red = poor, yellow = moderate, green = healthy)
var classVis = {min: 1, max: 3, palette: ['red', 'yellow', 'green']};
Map.addLayer(classJune, classVis, 'Health classes June 2025', false);
Map.addLayer(classSep,  classVis, 'Health classes Sep 2025', true);

// 10d. Hectares per class
function classArea(cls, label) {
  var area = ee.Image.pixelArea().divide(10000)
    .addBands(cls.rename('class'))
    .reduceRegion({
      reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'class'}),
      geometry: aoi, scale: 10, maxPixels: 1e9
    });
  print('Area (ha) by class, ' + label, area);
}
classArea(classJune, 'June 2025');
classArea(classSep, 'Sep 2025');

// 10e. NDVI change map: September minus June
var growth = sep.subtract(june);
Map.addLayer(growth, {min: -0.5, max: 0.5, palette: ['red', 'white', 'green']},
  'NDVI change Jun to Sep', false);

// 10f. Mean NDVI in June, September and the change
print('Mean NDVI (June, Sep, change):',
  june.rename('June')
    .addBands(sep.rename('Sep'))
    .addBands(growth.rename('Change'))
    .reduceRegion({reducer: ee.Reducer.mean(), geometry: aoi, scale: 10}));

// 10g. Class transitions: code = June class * 10 + Sep class
// e.g. 23 = moderate in June -> healthy in Sep
var transition = classJune.multiply(10).add(classSep).rename('transition');
var transArea = ee.Image.pixelArea().divide(10000)
  .addBands(transition)
  .reduceRegion({
    reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'transition'}),
    geometry: aoi, scale: 10, maxPixels: 1e9
  });
print('Area (ha) by June->Sep transition', transArea);

// ---------------------------------------------------------------------
// 11. PHENOLOGY: PEAK NDVI AND MONTH OF PEAK (per pixel)
// ---------------------------------------------------------------------

// 11a. Add a 'peak_month' band (month number) to each monthly composite
var monthlyWithMonth = monthly.map(function(img) {
  var m = ee.Image.constant(ee.Number(img.get('month')))
    .rename('peak_month').toFloat();
  return img.addBands(m);
});

// 11b. Per pixel, keep the month with the highest NDVI (bands: NDVI, peak_month)
var peakImg = monthlyWithMonth.qualityMosaic('NDVI').clip(aoi);

// 11c. Peak NDVI map
Map.addLayer(peakImg.select('NDVI'),
  {min: 0.4, max: 1, palette: ndviPalette}, 'Peak NDVI 2025', false);

// 11d. Month-of-peak map (blue = January ... red = December)
Map.addLayer(peakImg.select('peak_month'),
  {min: 1, max: 12, palette: ['blue', 'cyan', 'green', 'yellow', 'orange', 'red']},
  'Month of peak NDVI', false);

// 11e. Mean peak NDVI over the AOI
print('Mean peak NDVI:', peakImg.select('NDVI').reduceRegion({
  reducer: ee.Reducer.mean(), geometry: aoi, scale: 10
}));

// 11f. Pixels that peaked in each month (use percentages, not raw counts)
print('Pixels by peak month:', peakImg.select('peak_month').reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(), geometry: aoi, scale: 10
}));

