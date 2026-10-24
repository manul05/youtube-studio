'use strict';

// The base pack draws every beat type; other packs override some and fall back to these.
module.exports = {
  ...require('./art.cjs'),
  ...require('./type.cjs'),
};
