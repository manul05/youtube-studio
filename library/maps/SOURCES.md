# Map data sources

Built on 2026-10-25 with `node tools/build-maps.cjs` from Natural Earth (public domain, https://www.naturalearthdata.com/about/terms-of-use/), files taken from https://github.com/nvkelso/natural-earth-vector (geojson folder):

| File | Source | Notes |
|---|---|---|
| `world_countries.geojson` | `ne_10m_admin_0_countries_ind.geojson` (India point of view) | Simplified to 0.08°. Properties: iso3, name. |
| `india_states.geojson` | India outline from `ne_10m_admin_0_countries_ind.geojson`; states from `ne_10m_admin_1_states_provinces.geojson` (adm0_a3 = IND) | Simplified to 0.01°. The outline follows Natural Earth's India point-of-view boundary; state lines are Natural Earth admin-1. |

**Owner check required before the first video with a map:** compare `india_states.geojson` (render a map beat in the storyboard) with the official Survey of India political map. Indian law expects maps of India to show India's official external boundaries. Do not publish a map of India until you have confirmed it. Then change the line below to your name and the date.

Owner confirmation: NOT YET CONFIRMED
