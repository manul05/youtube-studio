'use strict';

// The base pack draws every beat type; other packs override some and fall back to these.
module.exports = {
  ...require('./art.cjs'),
  ...require('./type.cjs'),
  ...require('./data.cjs'),
};
// Schedules and helpers exported by data.cjs are not beat types; remove them from the map.
for (const key of ['compareSchedule', 'timelineSchedule', 'listSchedule', 'heading'])
  delete module.exports[key];
