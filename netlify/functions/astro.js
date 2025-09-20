/*
astro.js

Node.js module for basic Vedic/Western astrology chart calculations using Swiss Ephemeris (swisseph npm).

Features:
- Compute Julian Day (UT) for given birth details
- Compute planetary longitudes for Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Rahu, Ketu
- Compute Ascendant (Lagna) and house cusps (Placidus)
- Option to choose sidereal ayanamsa (Lahiri) or tropical (default)
- Exports a main function `computeChart(birth)` which returns a structured chart object

Installation:
  npm install swisseph

Usage:
  const { computeChart } = require('./astro');
  (async () => {
    const chart = await computeChart({
      year: 1989, month: 4, day: 25,
      hour: 13, minute: 32, second: 0,
      tz: 5.5, // IST = +5.5
      lat: 12.9165, lon: 79.1325, // Vellore
      houseSystem: 'P', // Placidus 'P', Koch 'K', etc. (Swiss Ephemeris supports some systems)
      ayanamsa: 'lahiri' // or null for tropical
    });
    console.log(JSON.stringify(chart, null, 2));
  })();

Notes:
- This module uses swisseph callbacks; functions are wrapped in Promises for async/await.
- Rahu/Ketu are computed using mean nodes by default; you can switch to true nodes by setting `useTrueNodes: true`.
- For production-grade systems you'll want additional error handling, house system options, and more precise timezone handling (including DST).
*/

const swe = require('swisseph');

// Map planet constants for convenience
const PLANETS = {
  sun: swe.SweConst.SE_SUN,
  moon: swe.SweConst.SE_MOON,
  mercury: swe.SweConst.SE_MERCURY,
  venus: swe.SweConst.SE_VENUS,
  mars: swe.SweConst.SE_MARS,
  jupiter: swe.SweConst.SE_JUPITER,
  saturn: swe.SweConst.SE_SATURN,
  uranus: swe.SweConst.SE_URANUS,
  neptune: swe.SweConst.SE_NEPTUNE,
  pluto: swe.SweConst.SE_PLUTO,
  meanNode: swe.SweConst.SE_MEAN_NODE, // Rahu (mean)
  trueNode: swe.SweConst.SE_TRUE_NODE, // Rahu (true)
};

// Helper: set ephemeris path to current working directory's 'ephemeris' or fallback to default
function setEphemerisPath(path) {
  try {
    swe.swe_set_ephe_path(path);
  } catch (e) {
    // ignore; swisseph will try its internal path
  }
}

// Wrap swe.swe_julday
function julianDayUTC(year, month, day, hour, minute, second) {
  const ut = hour + minute / 60 + second / 3600;
  // swe.swe_julday(year, month, day, ut, flag) -> returns JD
  return swe.swe_julday(year, month, day, ut);
}

// Wrap swe.swe_calc_ut in a Promise
function calcPlanet(jd_ut, planet, flags = swe.SEFLG_SWIEPH) {
  return new Promise((resolve, reject) => {
    swe.swe_calc_ut(jd_ut, planet, flags, (err, res) => {
      if (err) return reject(err);
      // res = [longitude, latitude, distance, speed_long, speed_lat, speed_dist]
      resolve(res);
    });
  });
}

// Get houses and ascendant
function calcHouses(jd_ut, lat, lon, houseSystem = 'P') {
  return new Promise((resolve, reject) => {
    // swe.swe_houses(jd_ut, lat, lon, hsys, callback)
    swe.swe_houses(jd_ut, lat, lon, houseSystem, (err, res) => {
      if (err) return reject(err);
      // res = {cusps: [...], ascmc: [...]}
      resolve(res);
    });
  });
}

// Utility: normalize angle to 0-360
function norm360(angle) {
  let a = angle % 360;
  if (a < 0) a += 360;
  return a;
}

// Convert decimal degrees to sign + degrees-min-sec and sign index (1 Aries ... 12 Pisces)
function degToSignObject(deg) {
  const normalized = norm360(deg);
  const signIndex = Math.floor(normalized / 30) + 1; // 1..12
  const signDeg = normalized % 30;
  const d = Math.floor(signDeg);
  const m = Math.floor((signDeg - d) * 60);
  const s = ((signDeg - d) * 60 - m) * 60;
  return {
    longitude: normalized,
    sign: signIndex,
    signName: zodiacName(signIndex),
    deg: d,
    min: m,
    sec: Number(s.toFixed(2)),
  };
}

function zodiacName(idx) {
  const names = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
  return names[idx - 1] || null;
}

// Main function
async function computeChart(options) {
  /*
    options: {
      year, month, day,
      hour, minute, second,
      tz: timezone offset in hours (e.g. IST +5.5)
      lat, lon (decimal degrees, lat + north, lon + east)
      houseSystem: 'P' (Placidus) default
      ayanamsa: null | 'lahiri' (if sidereal), other options possible
      useTrueNodes: boolean (default false)
    }
  */
  const {
    year, month, day,
    hour = 0, minute = 0, second = 0,
    tz = 0,
    lat, lon,
    houseSystem = 'P',
    ayanamsa = null,
    useTrueNodes = false,
  } = options;

  if (!year || !month || !day) throw new Error('Missing date components');
  if (typeof lat !== 'number' || typeof lon !== 'number') throw new Error('Missing lat/lon');

  // Set ephemeris path (optional) - adjust if you put ephemeris files locally
  setEphemerisPath('./ephemeris');

  // Convert local time -> UT by subtracting tz
  const localHour = hour + minute / 60 + second / 3600;
  const utHour = localHour - tz;
  // Compute JD in UT
  const jd_ut = swe.swe_julday(year, month, day, utHour);

  // Apply ayanamsa if requested (sidereal)
  if (ayanamsa && ayanamsa.toLowerCase() === 'lahiri') {
    // Set sidereal mode Lahiri
    swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI);
  } else {
    // Tropical
    swe.swe_set_sid_mode(swe.SE_SIDM_FAGAN_BRADLEY); // we override to a default but turn off when ayanamsa null by using 0
    // To ensure tropical, set sid mode to 0
    swe.swe_set_sid_mode(0);
  }

  // Determine node constant
  const nodeConst = useTrueNodes ? PLANETS.trueNode : PLANETS.meanNode;

  const planetKeys = ['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'];

  const planets = {};

  for (const key of planetKeys) {
    const pconst = PLANETS[key];
    try {
      const res = await calcPlanet(jd_ut, pconst, swe.SEFLG_SWIEPH);
      const lon = norm360(res[0]);
      planets[key] = {
        longitude: lon,
        speed: res[3],
        ...degToSignObject(lon)
      };
    } catch (err) {
      planets[key] = { error: String(err) };
    }
  }

  // Nodes (Rahu/Ketu)
  try {
    const nres = await calcPlanet(jd_ut, nodeConst, swe.SEFLG_SWIEPH);
    const rahuLon = norm360(nres[0]);
    const ketuLon = norm360(rahuLon + 180);
    planets['rahu'] = { longitude: rahuLon, ...degToSignObject(rahuLon) };
    planets['ketu'] = { longitude: ketuLon, ...degToSignObject(ketuLon) };
  } catch (err) {
    planets['rahu'] = { error: String(err) };
    planets['ketu'] = { error: String(err) };
  }

  // Houses + Ascendant
  let housesObj;
  try {
    housesObj = await calcHouses(jd_ut, lat, lon, houseSystem);
  } catch (err) {
    housesObj = { error: String(err) };
  }

  const cusps = (housesObj.cusps || []).map(c => (c ? degToSignObject(c) : null));
  const ascmc = (housesObj.ascmc || []).map(a => (a ? degToSignObject(a) : null));

  const asc = ascmc[0] || null;
  const mc = ascmc[1] || null;

  // Build simple chart
  const chart = {
    input: { year, month, day, hour, minute, second, tz, lat, lon, houseSystem, ayanamsa, useTrueNodes },
    julianDayUT: jd_ut,
    planets,
    ascendant: asc,
    midheaven: mc,
    cusps,
  };

  return chart;
}

module.exports = { computeChart };
