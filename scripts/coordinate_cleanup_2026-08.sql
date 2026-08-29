-- Coordinate cleanup after the legacy import. Safe to re-run.
-- Real duplicate rows are archived as draft rather than deleted.
begin;

update places as p
set latitude = v.latitude, longitude = v.longitude
from (values
  ('jp_1ch5g34', 34.178108::double precision, 131.478622::double precision),
  ('jp_02ibg2r', 34.178711, 131.478317),
  ('jp_12sa5pz', 35.0101265, 135.768105),
  ('jp_0lrmvl3_2', 35.2977354, 139.4813837),
  ('jp_1ml54j5', 35.4747915, 138.6665393),
  ('jp_0zg01o9', 35.6600024, 139.6987312),
  ('jp_1db2yzz', 35.664635, 139.70462),
  ('jp_0lqjcu9', 35.670723, 139.704788),
  ('jp_09q1ews', 35.670776, 139.479736),
  ('jp_054ogji', 35.6662428, 139.5026237),
  ('jp_0mymcx2', 35.6826907, 139.7643437),
  ('jp_0gsavhd', 35.7049444, 139.5771236),
  ('jp_15mtus0', 35.704658, 139.5747287),
  ('jp_1nyft0q', 35.700695, 139.5711865),
  ('jp_1y0hxce', 35.7092407, 139.6656853),
  ('jp_0ose2qj', 35.7101011, 139.8093338),
  ('jp_14vnmmh', 35.7118027, 139.4094381),
  ('jp_1lz1jke', 35.7122591, 139.3943216),
  ('jp_05oodrh', 35.696358, 139.419891),
  ('jp_1nq28m0', 35.6987812, 139.4182267),
  ('jp_1sieasc', 35.695591, 139.42009),
  ('jp_0rxy9bm', 35.7014227, 139.4137502),
  ('jp_1gk01rl', 35.720364, 139.464783),
  ('jp_1z02m35', 35.741918, 139.500412),
  ('jp_0v21i1t', 35.7247892, 139.7685576),
  ('jp_0cvctxb', 35.7272396, 139.1881471),
  ('jp_15niyyn', 35.7469079, 139.2091329),
  ('jp_0ep0orn', 35.8009016, 139.1848433),
  ('jp_1szyxxr', 35.7960037, 139.1613433),
  ('jp_16f2k57', 35.8111087, 139.1239588),
  ('jp_1q3kcuy', 35.8131774, 139.1291762),
  ('jp_0b9vpe6', 35.9145787, 138.4195054)
  ,('jp_13wmexo', 35.312986, 139.533521)
) as v(legacy_id, latitude, longitude)
where p.legacy_id = v.legacy_id;

update places
set prefecture = '神奈川県',
    municipality = '鎌倉市',
    station_walk_min = 5,
    access_source_url = 'https://www.hasedera.jp/guide/',
    cluster_id = 'kanagawa_kamakura_hase',
    google_maps_url = 'https://www.google.com/maps/place/Benten+Cave/data=!4m2!3m1!1s0x601845f3f066881b:0x893bf09de79c9bbe',
    website_url = 'https://www.hasedera.jp/about/',
    legacy_data = legacy_data || jsonb_build_object(
      'name', '弁天窟 (Benten-kutsu)',
      'summary', '弁天窟 — небольшая рукотворная пещера на территории храма 長谷寺 в Камакуре.',
      'interest', 'В стенах высечены Бэндзайтэн и шестнадцать её спутников; короткое, тесное и очень атмосферное подземное святилище.',
      'prefecture', jsonb_build_object('jp', '神奈川県', 'ru', 'Канагава'),
      'area', jsonb_build_object('jp', '鎌倉市長谷', 'ru', 'Камакура · Хасэ'),
      'location', jsonb_build_object('lat', 35.312986, 'lng', 139.533521, 'nearestStation', '長谷駅 (станция Хасэ)', 'stationWalkMin', 5),
      'cluster', jsonb_build_object('id', 'kanagawa_kamakura_hase', 'name', 'Камакура · Хасэ'),
      'links', jsonb_build_object('googleMaps', 'https://www.google.com/maps/place/Benten+Cave/data=!4m2!3m1!1s0x601845f3f066881b:0x893bf09de79c9bbe', 'officialOrSource', 'https://www.hasedera.jp/about/')
    )
where legacy_id = 'jp_13wmexo';

update place_translations
set name = '弁天窟 (Benten-kutsu)',
    area = 'Камакура · Хасэ',
    summary = '弁天窟 — небольшая рукотворная пещера на территории храма 長谷寺 в Камакуре.',
    interest = 'В стенах высечены Бэндзайтэн и шестнадцать её спутников; короткое, тесное и очень атмосферное подземное святилище.',
    nearest_station = '長谷駅 (станция Хасэ)',
    access_note = 'От станции 長谷駅 линии Энодэн — около 5 минут пешком; пещера находится внутри платной территории 長谷寺.',
    hours_note = 'Вход вместе с посещением 長谷寺: обычно 8:00–17:00, с продлёнными часами с апреля по июнь.',
    price_note = 'Взрослые — 400 иен, дети 6–11 лет — 200 иен.',
    cluster_name = 'Камакура · Хасэ'
where place_id = (select id from places where legacy_id = 'jp_13wmexo')
  and locale = 'ru';

update places
set status = 'draft'
where legacy_id in (
  'jp_0lrmvl3',
  'jp_18ktc9u',
  'jp_1db0uec_2',
  'jp_1w3xi98',
  'jp_07cuv2n_2'
);

commit;
