/**
 * Sample VEVENT-shaped objects for Edge Esmeralda 2026 — Week 1 “Protocols for Flourishing”
 * (June 1–7 Healdsburg-adjacent village week per https://www.edgeesmeralda.com/ themes).
 * Overlap packs use several waves per day (morning→evening), staggered by weekday, so circadian disks aren’t only 10:00 / 13:00.
 *
 * Times stored as UTC (PDT = UTC−7 in June). E.g. 14:00Z = 07:00 local.
 */
(function (global) {
  var LOC = 'Edge Esmeralda, Healdsburg, CA';
  var LAYER_ID = 'edge-esmeralda-w1';

  /** PDT morning hour h → UTC hour for same calendar day in June */
  function z(h, m) {
    var utcH = h + 7;
    return { h: utcH, m: m || 0 };
  }

  function iso(day, localH, localM, durMin) {
    var t = z(localH, localM);
    var d0 = new Date(Date.UTC(2026, 5, day, t.h, t.m, 0));
    var d1 = new Date(d0.getTime() + durMin * 60000);
    function fmt(dt) {
      return dt.toISOString().replace(/\.\d{3}Z$/, 'Z');
    }
    return { start: fmt(d0), end: fmt(d1) };
  }

  function ev(uid, day, h0, m0, durMin, summary, description, color, category) {
    var t = iso(day, h0, m0, durMin);
    return {
      uid: 'ee26-w1-' + uid,
      summary: summary,
      description: description || '',
      location: LOC,
      dtstart: { dateTime: t.start },
      dtend: { dateTime: t.end },
      color: color,
      categories: [category],
      status: 'CONFIRMED'
    };
  }

  var C = {
    fitness: '#ef476f',
    wellness: '#9b5de5',
    talk: '#00b4d8',
    bio: '#06d6a0',
    meal: '#ffd166',
    nature: '#2ec4b6',
    social: '#f15bb5',
    workshop: '#7b2cbf'
  };

  var events = [];

  function pushMany(list) {
    for (var i = 0; i < list.length; i++) events.push(list[i]);
  }

  // --- June 1 (day 1) — arrival / opening ---
  pushMany([
    ev('d1-001', 1, 6, 30, 60, 'Trail run (moderate)', 'Redwoods loop; bring water.', C.fitness, 'Fitness'),
    ev('d1-002', 1, 6, 30, 60, 'Guided sunrise breathwork', 'Outdoor mats; nose breathing progressions.', C.wellness, 'Wellness'),
    ev('d1-003', 1, 6, 30, 75, 'Mobility & joint prep', 'Hips/shoulders for the week.', C.fitness, 'Fitness'),
    ev('d1-010', 1, 8, 0, 90, 'Opening circle: Protocols for Flourishing', 'Week 1 frame: health, consciousness, wellbeing.', C.talk, 'Salon'),
    ev('d1-011', 1, 8, 0, 90, 'Coffee & village map walk', 'Low-key intros while walking campus.', C.meal, 'Social'),
    ev('d1-020', 1, 9, 45, 75, 'Salon: Metabolic health & continuous signals', 'CGM, sleep, HRV — what to trust.', C.talk, 'Salon'),
    ev('d1-021', 1, 9, 45, 75, 'Intro somatics lab', 'Interoception basics; partner drills.', C.wellness, 'Workshop'),
    ev('d1-022', 1, 9, 45, 75, 'Biomarker literacy 101', 'How to read a basic panel.', C.bio, 'Bio'),
    ev('d1-030', 1, 11, 30, 90, 'Longevity protocols debate', 'Rapamycin, heat, cold, sleep — tradeoffs.', C.talk, 'Salon'),
    ev('d1-031', 1, 11, 30, 90, 'Yoga flow (all levels)', 'Spacious sequencing.', C.fitness, 'Fitness'),
    ev('d1-032', 1, 11, 30, 90, 'Kitchen skills: ferment & fiber', 'Hands-on; take home starter.', C.workshop, 'Workshop'),
    ev('d1-040', 1, 12, 30, 90, 'Community lunch — main pavilion', 'Dietary cards at check-in.', C.meal, 'Meal'),
    ev('d1-041', 1, 12, 30, 90, 'Brown-bag lunch: small-group themes', 'Pick a table topic at the door.', C.meal, 'Meal'),
    ev('d1-050', 1, 14, 15, 75, 'Cold plunge & recovery science', 'Contraindications reviewed on site.', C.wellness, 'Workshop'),
    ev('d1-051', 1, 14, 15, 75, 'Neuroplasticity & aging', 'Talk + Q&A.', C.bio, 'Bio'),
    ev('d1-052', 1, 14, 15, 75, 'Strength: kettlebell fundamentals', 'Technique-first session.', C.fitness, 'Fitness'),
    ev('d1-060', 1, 15, 45, 60, 'Office hours: sleep stack', 'Bring wearables questions.', C.talk, 'Salon'),
    ev('d1-061', 1, 15, 45, 60, 'Herb walk (easy)', 'ID + foraging ethics.', C.nature, 'Nature'),
    ev('d1-062', 1, 15, 45, 60, 'Creative journaling for stress', 'Guided prompts.', C.wellness, 'Workshop'),
    ev('d1-070', 1, 17, 0, 90, 'HIIT + mobility finisher', 'Modify as needed.', C.fitness, 'Fitness'),
    ev('d1-071', 1, 17, 0, 90, 'Biohacking demos fair', 'Short rotating stations.', C.bio, 'Bio'),
    ev('d1-080', 1, 18, 30, 120, 'Welcome dinner & toasts', 'Program team + village leads.', C.meal, 'Meal'),
    ev('d1-081', 1, 18, 30, 120, 'Silent dinner option', 'Phones away; sign at entry.', C.meal, 'Meal'),
    ev('d1-090', 1, 19, 30, 120, 'Acoustic set — meadow stage', 'Bring blanket.', C.social, 'Social'),
    ev('d1-091', 1, 19, 30, 120, 'Stargazing hike (easy)', 'Red lights only after dark.', C.nature, 'Nature'),
    ev('d1-092', 1, 19, 30, 90, 'Ecstatic dance (opening night)', 'Consent & sobriety norms posted.', C.social, 'Dance')
  ]);

  // --- June 2 ---
  pushMany([
    ev('d2-001', 2, 6, 30, 60, 'Meditation: open awareness', 'Cushions & chairs.', C.wellness, 'Wellness'),
    ev('d2-002', 2, 6, 30, 60, 'Bike skills & safety', 'Helmets required.', C.fitness, 'Fitness'),
    ev('d2-003', 2, 6, 30, 60, 'Swim technique (pool)', 'Lanes by speed.', C.fitness, 'Fitness'),
    ev('d2-010', 2, 8, 0, 90, 'Talk: Environmental toxins & resilience', 'Practical avoidance hierarchy.', C.bio, 'Bio'),
    ev('d2-011', 2, 8, 0, 90, 'Pilates core', 'Small props.', C.fitness, 'Fitness'),
    ev('d2-020', 2, 9, 45, 75, 'Regenerative food systems tour', 'Farm partners visit.', C.nature, 'Nature'),
    ev('d2-021', 2, 9, 45, 75, 'AI for personal health data', 'Privacy-first workflows.', C.talk, 'Salon'),
    ev('d2-022', 2, 9, 45, 75, 'Partner massage basics', 'Clothed; boundaries emphasized.', C.wellness, 'Workshop'),
    ev('d2-030', 2, 11, 15, 75, 'Microbiome myths vs evidence', 'Salon format.', C.bio, 'Bio'),
    ev('d2-031', 2, 11, 15, 75, 'Dance cardio', 'High energy.', C.fitness, 'Fitness'),
    ev('d2-032', 2, 11, 15, 75, 'Protocol design studio', 'Draft a personal protocol.', C.workshop, 'Workshop'),
    ev('d2-040', 2, 12, 30, 75, 'Lunch: vendor row', 'Pay-as-you-go stalls.', C.meal, 'Meal'),
    ev('d2-041', 2, 12, 30, 75, 'Pack lunch hike', '3 mi; pre-order box.', C.nature, 'Nature'),
    ev('d2-050', 2, 14, 0, 90, 'Strength: barbell intro', 'Empty bar to light loads.', C.fitness, 'Fitness'),
    ev('d2-051', 2, 14, 0, 90, 'Psychedelic medicine ethics (legal frame)', 'Education only; no substances.', C.talk, 'Salon'),
    ev('d2-052', 2, 14, 0, 90, 'Art studio: somatic drawing', 'Charcoal & big paper.', C.wellness, 'Workshop'),
    ev('d2-060', 2, 15, 45, 75, 'VO2 / zone-2 lab open house', 'Sign up for slots.', C.bio, 'Bio'),
    ev('d2-061', 2, 15, 45, 75, 'Pickleball social', 'Rotating partners.', C.social, 'Social'),
    ev('d2-062', 2, 15, 45, 75, 'Nonviolent communication basics', 'Role-play light.', C.wellness, 'Workshop'),
    ev('d2-070', 2, 17, 15, 75, 'Panel: Consciousness & measurement', 'Inspired by Consciousness Week themes.', C.talk, 'Salon'),
    ev('d2-071', 2, 17, 15, 75, 'Sunset yoga', 'Slow flow.', C.fitness, 'Fitness'),
    ev('d2-080', 2, 18, 45, 90, 'Family-style dinner', 'Long tables.', C.meal, 'Meal'),
    ev('d2-090', 2, 20, 0, 120, 'Contra dance lesson + dance', 'Live band.', C.social, 'Dance'),
    ev('d2-091', 2, 20, 0, 120, 'Late-night sauna rounds', 'Hydration required.', C.wellness, 'Wellness')
  ]);

  // --- June 3 ---
  pushMany([
    ev('d3-001', 3, 6, 30, 60, 'Fasted walk (optional)', 'Easy pace; water only.', C.nature, 'Nature'),
    ev('d3-002', 3, 6, 30, 60, 'Tai chi', 'Yang short form intro.', C.wellness, 'Wellness'),
    ev('d3-003', 3, 6, 30, 60, 'CrossFit-style WOD (scaled)', 'Coaches on floor.', C.fitness, 'Fitness'),
    ev('d3-010', 3, 8, 0, 90, 'Vital Futures: metabolic diagnostics', 'Inspired by Edge Esmeralda “Vital Futures” track.', C.bio, 'Bio'),
    ev('d3-011', 3, 8, 0, 90, 'Rowing technique', 'Erg focus.', C.fitness, 'Fitness'),
    ev('d3-020', 3, 9, 45, 75, 'Longevity investing & research', 'Where dollars move science.', C.talk, 'Salon'),
    ev('d3-021', 3, 9, 45, 75, 'Sound bath', 'Lie-down; eye masks ok.', C.wellness, 'Wellness'),
    ev('d3-022', 3, 9, 45, 75, 'Kids movement hour', 'Ages 5–12; parent nearby.', C.fitness, 'Fitness'),
    ev('d3-030', 3, 11, 15, 75, 'Ethics of enhancement', 'Salon.', C.talk, 'Salon'),
    ev('d3-031', 3, 11, 15, 75, 'Trail intervals', 'Hill repeats.', C.fitness, 'Fitness'),
    ev('d3-032', 3, 11, 15, 75, 'Meal prep for busy builders', 'Batch cooking demo.', C.workshop, 'Workshop'),
    ev('d3-040', 3, 12, 30, 90, 'Lunch & learn: protein quality', 'Tasting flight.', C.meal, 'Meal'),
    ev('d3-041', 3, 12, 30, 90, 'Picnic lawn — bring blanket', 'Food trucks.', C.meal, 'Meal'),
    ev('d3-050', 3, 14, 15, 75, 'Continuous glucose: group readout', 'Anonymous aggregate demo.', C.bio, 'Bio'),
    ev('d3-051', 3, 14, 15, 75, 'Climbing wall open', 'Auto-belay training first.', C.fitness, 'Fitness'),
    ev('d3-052', 3, 14, 15, 75, 'Poetry & physiology', 'Readings + discussion.', C.wellness, 'Salon'),
    ev('d3-060', 3, 15, 45, 75, 'Office hours: supplements', 'Bring bottles; no sales.', C.talk, 'Salon'),
    ev('d3-061', 3, 15, 45, 75, 'Basketball pickup', 'Half court.', C.social, 'Social'),
    ev('d3-062', 3, 15, 45, 75, 'Garden volunteering', 'Gloves provided.', C.nature, 'Nature'),
    ev('d3-070', 3, 17, 0, 90, 'Heavy carry medley', 'Farmer’s walks, sled optional.', C.fitness, 'Fitness'),
    ev('d3-071', 3, 17, 0, 90, 'Cognitive tests you can self-run', 'Reaction time, Stroop, etc.', C.bio, 'Bio'),
    ev('d3-080', 3, 18, 30, 120, 'Taco night + salsa band', 'Outdoor.', C.meal, 'Meal'),
    ev('d3-090', 3, 20, 0, 120, 'DJ set — silent disco option', 'Two channels.', C.social, 'Dance'),
    ev('d3-091', 3, 20, 0, 90, 'Film short: futures of care', 'Discussion after.', C.talk, 'Salon')
  ]);

  // --- June 4 ---
  pushMany([
    ev('d4-001', 4, 6, 30, 60, 'Open-water swim prep (pool)', 'Cold tolerance talk after.', C.fitness, 'Fitness'),
    ev('d4-002', 4, 6, 30, 60, 'Zen sitting', 'Instruction for beginners.', C.wellness, 'Wellness'),
    ev('d4-003', 4, 6, 30, 60, 'Spin / indoor cycling', 'Bring towel.', C.fitness, 'Fitness'),
    ev('d4-010', 4, 8, 0, 90, 'Neurotech wearables landscape', 'EEG, sleep staging, hype vs signal.', C.bio, 'Bio'),
    ev('d4-011', 4, 8, 0, 90, 'Dance warmup: house basics', 'All levels.', C.fitness, 'Fitness'),
    ev('d4-020', 4, 9, 45, 75, 'Salon: reproducible self-experiments', 'n=1 design patterns.', C.talk, 'Salon'),
    ev('d4-021', 4, 9, 45, 75, 'Forest therapy walk', 'Certified guide.', C.nature, 'Nature'),
    ev('d4-022', 4, 9, 45, 75, 'Breath-hold safety & physiology', 'Dry drills only.', C.wellness, 'Workshop'),
    ev('d4-030', 4, 11, 15, 75, 'Equity in access to longevity tools', 'Facilitated.', C.talk, 'Salon'),
    ev('d4-031', 4, 11, 15, 75, 'Kickboxing basics', 'Pads.', C.fitness, 'Fitness'),
    ev('d4-032', 4, 11, 15, 75, 'Fermentation troubleshooting clinic', 'Bring your jar.', C.workshop, 'Workshop'),
    ev('d4-040', 4, 12, 30, 75, 'Mediterranean lunch', 'Olive oil tasting.', C.meal, 'Meal'),
    ev('d4-041', 4, 12, 30, 75, 'Ramen pop-up', 'Limited bowls.', C.meal, 'Meal'),
    ev('d4-050', 4, 14, 0, 90, 'Olympic lifting intro', 'PVC then light bar.', C.fitness, 'Fitness'),
    ev('d4-051', 4, 14, 0, 90, 'Gene therapy & regulation 101', 'Non-technical overview.', C.bio, 'Bio'),
    ev('d4-052', 4, 14, 0, 90, 'Improv for social resilience', 'Games low-pressure.', C.wellness, 'Workshop'),
    ev('d4-060', 4, 15, 45, 75, 'Investor office hours (health)', 'Sign-up sheet.', C.talk, 'Salon'),
    ev('d4-061', 4, 15, 45, 75, 'Volleyball', 'Grass court.', C.social, 'Social'),
    ev('d4-062', 4, 15, 45, 75, 'Sketching the body', 'Figure gesture, robed model.', C.wellness, 'Workshop'),
    ev('d4-070', 4, 17, 15, 75, 'Zone-2 group run', 'Conversational pace groups.', C.fitness, 'Fitness'),
    ev('d4-071', 4, 17, 15, 75, 'Cold shower challenge (optional)', 'Medical waiver kiosk.', C.wellness, 'Wellness'),
    ev('d4-080', 4, 18, 45, 120, 'Farm-to-table dinner', 'Chef’s table add-on lottery.', C.meal, 'Meal'),
    ev('d4-090', 4, 20, 0, 150, 'Swing dance night', 'Lesson 20:15.', C.social, 'Dance')
  ]);

  // --- June 5 ---
  pushMany([
    ev('d5-001', 5, 6, 30, 60, 'Trail run (hard option)', 'Self-sort by pace.', C.fitness, 'Fitness'),
    ev('d5-002', 5, 6, 30, 60, 'Qi gong', 'Eight pieces brocade.', C.wellness, 'Wellness'),
    ev('d5-003', 5, 6, 30, 60, 'Strength: unilateral balance', 'Single-leg focus.', C.fitness, 'Fitness'),
    ev('d5-010', 5, 8, 0, 90, 'Consciousness & contemplative science', 'Cross-disciplinary salon.', C.talk, 'Salon'),
    ev('d5-011', 5, 8, 0, 90, 'Aqua jog / recovery', 'Belts provided.', C.fitness, 'Fitness'),
    ev('d5-020', 5, 9, 45, 75, 'Organs-on-chips & demos (tour)', 'Biotech literacy.', C.bio, 'Bio'),
    ev('d5-021', 5, 9, 45, 75, 'Community science project kickoff', 'Citizen health metrics.', C.talk, 'Salon'),
    ev('d5-022', 5, 9, 45, 75, 'Partner acro-yoga intro', 'Spotters required.', C.fitness, 'Fitness'),
    ev('d5-030', 5, 11, 15, 75, 'Sleep architecture deep dive', 'Talk.', C.bio, 'Bio'),
    ev('d5-031', 5, 11, 15, 75, 'Capoeira basics', 'Music circle after.', C.fitness, 'Fitness'),
    ev('d5-032', 5, 11, 15, 75, 'Journaling for protocol adherence', 'Habit design.', C.wellness, 'Workshop'),
    ev('d5-040', 5, 12, 30, 90, 'BBQ lunch — veg options', 'Smoke-free zone map.', C.meal, 'Meal'),
    ev('d5-041', 5, 12, 30, 90, 'Bento & board games', 'Indoor quiet.', C.meal, 'Meal'),
    ev('d5-050', 5, 14, 15, 75, 'Ice bath rounds (supervised)', 'Short exposures.', C.wellness, 'Wellness'),
    ev('d5-051', 5, 14, 15, 75, 'Hackathon: build a health checklist app', 'Teams of 3–5.', C.workshop, 'Workshop'),
    ev('d5-052', 5, 14, 15, 75, 'Disc golf tournament', 'Casual bracket.', C.social, 'Social'),
    ev('d5-060', 5, 15, 45, 75, 'Office hours: injury prevention', 'PTs on site.', C.talk, 'Salon'),
    ev('d5-061', 5, 15, 45, 75, 'River wade & ecology talk', 'Water shoes.', C.nature, 'Nature'),
    ev('d5-062', 5, 15, 45, 75, 'Choir rehearsal (perform Sat)', 'No audition.', C.social, 'Social'),
    ev('d5-070', 5, 17, 0, 90, 'Metcon relay race', 'Teams.', C.fitness, 'Fitness'),
    ev('d5-071', 5, 17, 0, 90, 'Lightning talks: tools we actually use', '5 slides max.', C.talk, 'Salon'),
    ev('d5-080', 5, 18, 30, 120, 'Pasta night', 'GF station.', C.meal, 'Meal'),
    ev('d5-090', 5, 20, 0, 120, '80s cardio dance party', 'Costumes welcome.', C.social, 'Dance')
  ]);

  // --- June 6 ---
  pushMany([
    ev('d6-001', 6, 6, 30, 90, 'Long hike — ridge route', 'Shuttle; poles recommended.', C.nature, 'Nature'),
    ev('d6-002', 6, 6, 30, 60, 'Pool laps (structured)', 'Interval board.', C.fitness, 'Fitness'),
    ev('d6-003', 6, 6, 30, 60, 'Mindfulness for skeptics', 'Secular framing.', C.wellness, 'Wellness'),
    ev('d6-010', 6, 8, 30, 90, 'Panel: transhumanism & cultural taboos', 'Inspired by Edge “Transhumanism Workshop” themes; discussion only.', C.talk, 'Salon'),
    ev('d6-011', 6, 8, 30, 90, 'Ashtanga half-primary', 'Experienced room.', C.fitness, 'Fitness'),
    ev('d6-020', 6, 10, 15, 75, 'Stem cells & hype radar', 'Clinician-led.', C.bio, 'Bio'),
    ev('d6-021', 6, 10, 15, 75, 'Parkour basics (soft mats)', 'Wrist guards.', C.fitness, 'Fitness'),
    ev('d6-022', 6, 10, 15, 75, 'Non-dual inquiry circle', 'Chairs in round.', C.wellness, 'Wellness'),
    ev('d6-030', 6, 11, 45, 75, 'Public health & pandemic prep', 'Adult themes.', C.talk, 'Salon'),
    ev('d6-031', 6, 11, 45, 75, 'Spikeball tournament', 'Register pairs.', C.social, 'Social'),
    ev('d6-032', 6, 11, 45, 75, 'Bread science & sourdough', 'Take loaf home.', C.workshop, 'Workshop'),
    ev('d6-040', 6, 12, 30, 90, 'Food hall — global street food', 'Tokens.', C.meal, 'Meal'),
    ev('d6-050', 6, 14, 15, 75, 'Red team: debunking health claims', 'Interactive.', C.talk, 'Salon'),
    ev('d6-051', 6, 14, 15, 75, 'Martial arts: judo breakfalls', 'Gi rental limited.', C.fitness, 'Fitness'),
    ev('d6-052', 6, 14, 15, 75, 'Therapy animals visit', 'Outdoor pen.', C.wellness, 'Wellness'),
    ev('d6-060', 6, 15, 45, 75, 'Office hours: women’s health research', 'Inclusive language.', C.talk, 'Salon'),
    ev('d6-061', 6, 15, 45, 75, 'Cycling maintenance clinic', 'Bring bike.', C.workshop, 'Workshop'),
    ev('d6-062', 6, 15, 45, 75, 'Wildflower ID stroll', 'Cameras ok.', C.nature, 'Nature'),
    ev('d6-070', 6, 17, 0, 90, 'Team sports: ultimate frisbee', 'Spirit of the game.', C.fitness, 'Fitness'),
    ev('d6-071', 6, 17, 0, 90, 'Choir performance (short)', 'Amphitheater.', C.social, 'Social'),
    ev('d6-080', 6, 18, 30, 120, 'Seafood boil (alt: veg boil)', 'Bibs.', C.meal, 'Meal'),
    ev('d6-090', 6, 20, 0, 150, 'Live band + open dance floor', 'Earplugs at desk.', C.social, 'Dance')
  ]);

  // --- June 7 (closing day week 1) ---
  pushMany([
    ev('d7-001', 7, 6, 30, 60, 'Gratitude mile walk', 'Silent option.', C.nature, 'Nature'),
    ev('d7-002', 7, 6, 30, 60, 'Final sunrise yoga', 'All levels.', C.fitness, 'Fitness'),
    ev('d7-003', 7, 6, 30, 60, 'Easy spin flush ride', 'Coffee stop mid.', C.fitness, 'Fitness'),
    ev('d7-010', 7, 8, 0, 90, 'Week 1 synthesis: what we’ll carry forward', 'Large group.', C.talk, 'Salon'),
    ev('d7-011', 7, 8, 0, 90, 'Mobility cooldown marathon', 'Rotating stations.', C.wellness, 'Wellness'),
    ev('d7-020', 7, 9, 45, 75, 'Open mic: health hacks that stuck', '2 min each.', C.social, 'Social'),
    ev('d7-021', 7, 9, 45, 75, 'Biotech career office hours', 'Resume quick reviews.', C.bio, 'Bio'),
    ev('d7-022', 7, 9, 45, 75, 'Kids field day', 'Ages 5–12.', C.fitness, 'Fitness'),
    ev('d7-030', 7, 11, 15, 75, 'Looking ahead to Week 2 (Intelligence & Autonomy)', 'Preview Q&A only.', C.talk, 'Salon'),
    ev('d7-031', 7, 11, 15, 75, 'Pickup soccer farewell', 'Co-ed.', C.social, 'Social'),
    ev('d7-040', 7, 12, 30, 120, 'Community brunch & packing tips', 'Luggage tags.', C.meal, 'Meal'),
    ev('d7-050', 7, 14, 30, 90, 'One-on-one protocol reviews (lottery)', 'Sign-up Friday.', C.talk, 'Salon'),
    ev('d7-051', 7, 14, 30, 90, 'Last chance sauna & cold', 'Timed waves.', C.wellness, 'Wellness'),
    ev('d7-052', 7, 14, 30, 90, 'Short hikes — three distances', 'Choose at trailhead.', C.nature, 'Nature'),
    ev('d7-060', 7, 16, 0, 90, 'Closing circle (Week 1)', 'Gratitude + intentions.', C.wellness, 'Wellness'),
    ev('d7-061', 7, 16, 0, 90, 'Tea house quiet hours', 'Whisper only.', C.wellness, 'Wellness'),
    ev('d7-070', 7, 17, 30, 120, 'Farewell dinner — strings quartet', 'Jacket suggested.', C.meal, 'Meal'),
    ev('d7-080', 7, 19, 30, 180, 'Last dance: slow & fast sets', 'Week 1 finale.', C.social, 'Dance')
  ]);

  // --- Overlap packs: same start time within a wave (lanes), waves spread through the day; days staggered. ---
  function ol(day, uidSuffix, h, m, durMin, summary, description, color, category) {
    return ev('ol' + day + '-' + uidSuffix, day, h, m, durMin, summary, description, color, category);
  }

  /** ~7 local-time anchors from dawn → night; minutes jitter per calendar day so stacks don’t line up across the week. */
  function overlapWaveTimesPDT(day) {
    var d = day - 1;
    var seeds = [
      [7, 12 + (d * 3) % 22],
      [8, 48 + (d * 5) % 18],
      [10, 22 + (d * 7) % 20],
      [12, 8 + (d * 4) % 24],
      [14, 35 + (d * 6) % 22],
      [16, 52 + (d * 2) % 16],
      [19, 5 + (d * 5) % 28]
    ];
    var out = [];
    for (var i = 0; i < seeds.length; i++) {
      var h = seeds[i][0];
      var m = seeds[i][1];
      if (m >= 60) {
        h += Math.floor(m / 60);
        m %= 60;
      }
      if (h > 23) h = 23;
      if (h < 6) h = 6;
      out.push({ h: h, m: m });
    }
    return out;
  }

  function pushOlSpreadDay(day, rows) {
    var waves = overlapWaveTimesPDT(day);
    var w = waves.length;
    var n = rows.length;
    for (var i = 0; i < n; i++) {
      var wi = Math.min(w - 1, Math.floor((i * w) / n));
      var tm = waves[wi];
      var r = rows[i];
      events.push(ol(day, r.suf, tm.h, tm.m, r.dur, r.sum, r.desc, r.color, r.cat));
    }
  }

  pushOlSpreadDay(1, [
    { suf: 'p-a', dur: 50, sum: 'Stack: mobility flow A', desc: 'Parallel wave.', color: C.fitness, cat: 'Fitness' },
    { suf: 'p-b', dur: 50, sum: 'Stack: breath counting lab', desc: 'Parallel wave.', color: C.wellness, cat: 'Wellness' },
    { suf: 'p-c', dur: 50, sum: 'Stack: peptide discussion (edu)', desc: 'Parallel wave.', color: C.bio, cat: 'Bio' },
    { suf: 'p-d', dur: 50, sum: 'Stack: conflict resolution micro-salon', desc: 'Parallel wave.', color: C.talk, cat: 'Salon' },
    { suf: 'p-e', dur: 50, sum: 'Stack: trail shuttle signup desk', desc: 'Parallel wave.', color: C.nature, cat: 'Nature' },
    { suf: 'p-f', dur: 50, sum: 'Stack: coffee cupping', desc: 'Parallel wave.', color: C.meal, cat: 'Meal' },
    { suf: 'p-g', dur: 50, sum: 'Stack: stretch & chat', desc: 'Parallel wave.', color: C.social, cat: 'Social' },
    { suf: 'p-h', dur: 40, sum: 'Stack: sauna briefing A', desc: 'Parallel wave.', color: C.wellness, cat: 'Wellness' },
    { suf: 'p-i', dur: 40, sum: 'Stack: kettlebell skill circuit', desc: 'Parallel wave.', color: C.fitness, cat: 'Fitness' },
    { suf: 'p-j', dur: 40, sum: 'Stack: IRB & human subjects 101', desc: 'Parallel wave.', color: C.bio, cat: 'Bio' },
    { suf: 'p-k', dur: 40, sum: 'Stack: songwriting for stress', desc: 'Parallel wave.', color: C.workshop, cat: 'Workshop' },
    { suf: 'p-l', dur: 40, sum: 'Stack: VC office hours (health)', desc: 'Parallel wave.', color: C.talk, cat: 'Salon' }
  ]);

  pushOlSpreadDay(2, [
    { suf: 'p-a', dur: 50, sum: 'Stack: row sprints (erg)', desc: 'Parallel wave.', color: C.fitness, cat: 'Fitness' },
    { suf: 'p-b', dur: 50, sum: 'Stack: nervous system mapping', desc: 'Parallel wave.', color: C.wellness, cat: 'Wellness' },
    { suf: 'p-c', dur: 50, sum: 'Stack: pharmacokinetics cartoon hour', desc: 'Parallel wave.', color: C.bio, cat: 'Bio' },
    { suf: 'p-d', dur: 50, sum: 'Stack: climate x health salon', desc: 'Parallel wave.', color: C.talk, cat: 'Salon' },
    { suf: 'p-e', dur: 50, sum: 'Stack: mushroom ID (edibility ethics)', desc: 'Parallel wave.', color: C.nature, cat: 'Nature' },
    { suf: 'p-f', dur: 50, sum: 'Stack: lunch prep round-robin', desc: 'Parallel wave.', color: C.meal, cat: 'Meal' },
    { suf: 'p-g', dur: 50, sum: 'Stack: speed friending', desc: 'Parallel wave.', color: C.social, cat: 'Social' },
    { suf: 'p-h', dur: 50, sum: 'Stack: somatic coding (movement → pseudocode)', desc: 'Parallel wave.', color: C.workshop, cat: 'Workshop' },
    { suf: 'p-i', dur: 45, sum: 'Stack: zone-2 bike pods', desc: 'Parallel wave.', color: C.fitness, cat: 'Fitness' },
    { suf: 'p-j', dur: 45, sum: 'Stack: compassion meditation', desc: 'Parallel wave.', color: C.wellness, cat: 'Wellness' },
    { suf: 'p-k', dur: 45, sum: 'Stack: longevity biomarkers bingo', desc: 'Parallel wave.', color: C.bio, cat: 'Bio' },
    { suf: 'p-l', dur: 45, sum: 'Stack: policy & longevity salon', desc: 'Parallel wave.', color: C.talk, cat: 'Salon' },
    { suf: 'p-m', dur: 45, sum: 'Stack: frisbee golf intro', desc: 'Parallel wave.', color: C.social, cat: 'Social' },
    { suf: 'p-n', dur: 45, sum: 'Stack: knife skills (plant-based)', desc: 'Parallel wave.', color: C.workshop, cat: 'Workshop' }
  ]);

  pushOlSpreadDay(3, [
    { suf: 'p-a', dur: 50, sum: 'Stack: sandbag carries', desc: 'Parallel wave.', color: C.fitness, cat: 'Fitness' },
    { suf: 'p-b', dur: 50, sum: 'Stack: yoga nidra', desc: 'Parallel wave.', color: C.wellness, cat: 'Wellness' },
    { suf: 'p-c', dur: 50, sum: 'Stack: wearables teardown', desc: 'Parallel wave.', color: C.bio, cat: 'Bio' },
    { suf: 'p-d', dur: 50, sum: 'Stack: death over tea (facilitated)', desc: 'Parallel wave.', color: C.talk, cat: 'Salon' },
    { suf: 'p-e', dur: 50, sum: 'Stack: creek restoration walk', desc: 'Parallel wave.', color: C.nature, cat: 'Nature' },
    { suf: 'p-f', dur: 50, sum: 'Stack: dumpling folding', desc: 'Parallel wave.', color: C.meal, cat: 'Meal' },
    { suf: 'p-g', dur: 50, sum: 'Stack: board-game strategy', desc: 'Parallel wave.', color: C.social, cat: 'Social' },
    { suf: 'p-h', dur: 50, sum: 'Stack: public speaking for scientists', desc: 'Parallel wave.', color: C.workshop, cat: 'Workshop' },
    { suf: 'p-i', dur: 50, sum: 'Stack: salsa footwork drill', desc: 'Parallel wave.', color: C.social, cat: 'Dance' },
    { suf: 'p-j', dur: 60, sum: 'Mega-stack: clinic hour — sleep', desc: 'Parallel wave.', color: C.talk, cat: 'Salon' },
    { suf: 'p-k', dur: 60, sum: 'Mega-stack: clinic hour — hormones', desc: 'Parallel wave.', color: C.bio, cat: 'Bio' },
    { suf: 'p-l', dur: 60, sum: 'Mega-stack: clinic hour — strength', desc: 'Parallel wave.', color: C.fitness, cat: 'Fitness' },
    { suf: 'p-m', dur: 60, sum: 'Mega-stack: clinic hour — anxiety tools', desc: 'Parallel wave.', color: C.wellness, cat: 'Wellness' },
    { suf: 'p-n', dur: 60, sum: 'Mega-stack: clinic hour — nutrition labels', desc: 'Parallel wave.', color: C.meal, cat: 'Meal' },
    { suf: 'p-o', dur: 60, sum: 'Mega-stack: clinic hour — nature Rx', desc: 'Parallel wave.', color: C.nature, cat: 'Nature' },
    { suf: 'p-p', dur: 60, sum: 'Mega-stack: clinic hour — social health', desc: 'Parallel wave.', color: C.social, cat: 'Social' },
    { suf: 'p-q', dur: 60, sum: 'Mega-stack: clinic hour — protocol critique', desc: 'Parallel wave.', color: C.workshop, cat: 'Workshop' }
  ]);

  pushOlSpreadDay(4, [
    { suf: 'p-a', dur: 50, sum: 'Stack: sprint intervals (track)', desc: 'Parallel wave.', color: C.fitness, cat: 'Fitness' },
    { suf: 'p-b', dur: 50, sum: 'Stack: cold face dunk science', desc: 'Parallel wave.', color: C.wellness, cat: 'Wellness' },
    { suf: 'p-c', dur: 50, sum: 'Stack: optogenetics bedtime story', desc: 'Parallel wave.', color: C.bio, cat: 'Bio' },
    { suf: 'p-d', dur: 50, sum: 'Stack: epistemic humility salon', desc: 'Parallel wave.', color: C.talk, cat: 'Salon' },
    { suf: 'p-e', dur: 50, sum: 'Stack: birding blitz', desc: 'Parallel wave.', color: C.nature, cat: 'Nature' },
    { suf: 'p-f', dur: 50, sum: 'Stack: cheese & fermentation', desc: 'Parallel wave.', color: C.meal, cat: 'Meal' },
    { suf: 'p-g', dur: 50, sum: 'Stack: contact improv light', desc: 'Parallel wave.', color: C.social, cat: 'Social' },
    { suf: 'p-h', dur: 50, sum: 'Stack: wireframe your health app idea', desc: 'Parallel wave.', color: C.workshop, cat: 'Workshop' },
    { suf: 'p-i', dur: 60, sum: 'Mega-stack: lightning demos round 1', desc: 'Parallel wave.', color: C.bio, cat: 'Bio' },
    { suf: 'p-j', dur: 60, sum: 'Mega-stack: lightning demos round 2', desc: 'Parallel wave.', color: C.fitness, cat: 'Fitness' },
    { suf: 'p-k', dur: 60, sum: 'Mega-stack: lightning demos round 3', desc: 'Parallel wave.', color: C.wellness, cat: 'Wellness' },
    { suf: 'p-l', dur: 60, sum: 'Mega-stack: lightning demos round 4', desc: 'Parallel wave.', color: C.talk, cat: 'Salon' },
    { suf: 'p-m', dur: 60, sum: 'Mega-stack: lightning demos round 5', desc: 'Parallel wave.', color: C.nature, cat: 'Nature' },
    { suf: 'p-n', dur: 60, sum: 'Mega-stack: lightning demos round 6', desc: 'Parallel wave.', color: C.meal, cat: 'Meal' },
    { suf: 'p-o', dur: 60, sum: 'Mega-stack: lightning demos round 7', desc: 'Parallel wave.', color: C.social, cat: 'Social' },
    { suf: 'p-p', dur: 60, sum: 'Mega-stack: lightning demos round 8', desc: 'Parallel wave.', color: C.workshop, cat: 'Workshop' }
  ]);

  pushOlSpreadDay(5, [
    { suf: 'p-a', dur: 50, sum: 'Stack: atlas stone intro', desc: 'Parallel wave.', color: C.fitness, cat: 'Fitness' },
    { suf: 'p-b', dur: 50, sum: 'Stack: loving-kindness (short)', desc: 'Parallel wave.', color: C.wellness, cat: 'Wellness' },
    { suf: 'p-c', dur: 50, sum: 'Stack: reading a paper in 12 minutes', desc: 'Parallel wave.', color: C.bio, cat: 'Bio' },
    { suf: 'p-d', dur: 50, sum: 'Stack: governance of biobanks', desc: 'Parallel wave.', color: C.talk, cat: 'Salon' },
    { suf: 'p-e', dur: 50, sum: 'Stack: orienteering sprint', desc: 'Parallel wave.', color: C.nature, cat: 'Nature' },
    { suf: 'p-f', dur: 50, sum: 'Stack: spice blending workshop', desc: 'Parallel wave.', color: C.meal, cat: 'Meal' },
    { suf: 'p-g', dur: 50, sum: 'Stack: two truths & a protocol', desc: 'Parallel wave.', color: C.social, cat: 'Social' },
    { suf: 'p-h', dur: 50, sum: 'Stack: stretch for desk refugees', desc: 'Parallel wave.', color: C.workshop, cat: 'Workshop' },
    { suf: 'p-i', dur: 60, sum: 'Mega-stack: office hours block A', desc: 'Parallel wave.', color: C.talk, cat: 'Salon' },
    { suf: 'p-j', dur: 60, sum: 'Mega-stack: office hours block B', desc: 'Parallel wave.', color: C.bio, cat: 'Bio' },
    { suf: 'p-k', dur: 60, sum: 'Mega-stack: office hours block C', desc: 'Parallel wave.', color: C.fitness, cat: 'Fitness' },
    { suf: 'p-l', dur: 60, sum: 'Mega-stack: office hours block D', desc: 'Parallel wave.', color: C.wellness, cat: 'Wellness' },
    { suf: 'p-m', dur: 60, sum: 'Mega-stack: office hours block E', desc: 'Parallel wave.', color: C.nature, cat: 'Nature' },
    { suf: 'p-n', dur: 60, sum: 'Mega-stack: office hours block F', desc: 'Parallel wave.', color: C.meal, cat: 'Meal' },
    { suf: 'p-o', dur: 60, sum: 'Mega-stack: office hours block G', desc: 'Parallel wave.', color: C.social, cat: 'Social' },
    { suf: 'p-p', dur: 60, sum: 'Mega-stack: office hours block H', desc: 'Parallel wave.', color: C.workshop, cat: 'Workshop' },
    { suf: 'p-q', dur: 60, sum: 'Mega-stack: office hours block I', desc: 'Parallel wave.', color: C.social, cat: 'Dance' }
  ]);

  pushOlSpreadDay(6, [
    { suf: 'p-a', dur: 50, sum: 'Stack: Murph prep (partitioned)', desc: 'Parallel wave.', color: C.fitness, cat: 'Fitness' },
    { suf: 'p-b', dur: 50, sum: 'Stack: body scan marathon start', desc: 'Parallel wave.', color: C.wellness, cat: 'Wellness' },
    { suf: 'p-c', dur: 50, sum: 'Stack: CRISPR ethics speed-read', desc: 'Parallel wave.', color: C.bio, cat: 'Bio' },
    { suf: 'p-d', dur: 50, sum: 'Stack: hope vs hype salon', desc: 'Parallel wave.', color: C.talk, cat: 'Salon' },
    { suf: 'p-e', dur: 50, sum: 'Stack: invasive species pull', desc: 'Parallel wave.', color: C.nature, cat: 'Nature' },
    { suf: 'p-f', dur: 50, sum: 'Stack: chili cookoff tasting', desc: 'Parallel wave.', color: C.meal, cat: 'Meal' },
    { suf: 'p-g', dur: 50, sum: 'Stack: cooperative games', desc: 'Parallel wave.', color: C.social, cat: 'Social' },
    { suf: 'p-h', dur: 50, sum: 'Stack: zine: draw your stack', desc: 'Parallel wave.', color: C.workshop, cat: 'Workshop' },
    { suf: 'p-i', dur: 45, sum: 'Stack: handstand prep', desc: 'Parallel wave.', color: C.fitness, cat: 'Fitness' },
    { suf: 'p-j', dur: 45, sum: 'Stack: EMDR demo (educational)', desc: 'Parallel wave.', color: C.wellness, cat: 'Wellness' },
    { suf: 'p-k', dur: 45, sum: 'Stack: synthetic biology safety', desc: 'Parallel wave.', color: C.bio, cat: 'Bio' },
    { suf: 'p-l', dur: 45, sum: 'Stack: community agreements reset', desc: 'Parallel wave.', color: C.talk, cat: 'Salon' },
    { suf: 'p-m', dur: 45, sum: 'Stack: sunset photo walk', desc: 'Parallel wave.', color: C.nature, cat: 'Nature' },
    { suf: 'p-n', dur: 45, sum: 'Stack: mocktail mix-down', desc: 'Parallel wave.', color: C.meal, cat: 'Meal' }
  ]);

  pushOlSpreadDay(7, [
    { suf: 'p-a', dur: 45, sum: 'Stack: last hard workout option', desc: 'Parallel wave.', color: C.fitness, cat: 'Fitness' },
    { suf: 'p-b', dur: 45, sum: 'Stack: gratitude letters quiet room', desc: 'Parallel wave.', color: C.wellness, cat: 'Wellness' },
    { suf: 'p-c', dur: 45, sum: 'Stack: what we measured & learned', desc: 'Parallel wave.', color: C.bio, cat: 'Bio' },
    { suf: 'p-d', dur: 45, sum: 'Stack: village feedback session', desc: 'Parallel wave.', color: C.talk, cat: 'Salon' },
    { suf: 'p-e', dur: 45, sum: 'Stack: nursery tree planting', desc: 'Parallel wave.', color: C.nature, cat: 'Nature' },
    { suf: 'p-f', dur: 45, sum: 'Stack: leftover magic lunch', desc: 'Parallel wave.', color: C.meal, cat: 'Meal' },
    { suf: 'p-g', dur: 45, sum: 'Stack: contact swap & stickers', desc: 'Parallel wave.', color: C.social, cat: 'Social' },
    { suf: 'p-h', dur: 45, sum: 'Stack: pack-out ergonomics', desc: 'Parallel wave.', color: C.workshop, cat: 'Workshop' },
    { suf: 'p-i', dur: 50, sum: 'Stack: final office hours swarm A', desc: 'Parallel wave.', color: C.talk, cat: 'Salon' },
    { suf: 'p-j', dur: 50, sum: 'Stack: final office hours swarm B', desc: 'Parallel wave.', color: C.bio, cat: 'Bio' },
    { suf: 'p-k', dur: 50, sum: 'Stack: final office hours swarm C', desc: 'Parallel wave.', color: C.fitness, cat: 'Fitness' },
    { suf: 'p-l', dur: 50, sum: 'Stack: final office hours swarm D', desc: 'Parallel wave.', color: C.wellness, cat: 'Wellness' },
    { suf: 'p-m', dur: 50, sum: 'Stack: final office hours swarm E', desc: 'Parallel wave.', color: C.nature, cat: 'Nature' },
    { suf: 'p-n', dur: 50, sum: 'Stack: final office hours swarm F', desc: 'Parallel wave.', color: C.meal, cat: 'Meal' },
    { suf: 'p-o', dur: 50, sum: 'Stack: final office hours swarm G', desc: 'Parallel wave.', color: C.social, cat: 'Social' },
    { suf: 'p-p', dur: 60, sum: 'Stack: last-night dance workshop A', desc: 'Parallel wave.', color: C.social, cat: 'Dance' },
    { suf: 'p-q', dur: 60, sum: 'Stack: last-night dance workshop B', desc: 'Parallel wave.', color: C.fitness, cat: 'Fitness' },
    { suf: 'p-r', dur: 60, sum: 'Stack: last-night acoustic circle', desc: 'Parallel wave.', color: C.social, cat: 'Social' },
    { suf: 'p-s', dur: 60, sum: 'Stack: last-night tea ceremony', desc: 'Parallel wave.', color: C.wellness, cat: 'Wellness' },
    { suf: 'p-t', dur: 60, sum: 'Stack: last-night stargaze repeat', desc: 'Parallel wave.', color: C.nature, cat: 'Nature' }
  ]);

  function toVEvents(raw) {
    if (typeof VEvent === 'undefined') return raw;
    return raw.map(function (e) {
      return VEvent.fromJSON(e);
    });
  }

  /**
   * Load samples into CircaevumGL (replaces layer contents).
   * @param {{ replace?: boolean }} opts
   */
  function loadEdgeEsmeraldaWeek1Samples(opts) {
    opts = opts || {};
    var gl = typeof global.getGL === 'function' ? global.getGL() : null;
    if (!gl || typeof gl.ingestEvents !== 'function') {
      console.warn('CircaevumGL not ready; try again after scene init.');
      return 0;
    }
    var vevents = toVEvents(events);
    var styles = {
      Fitness: { color: C.fitness, visible: true },
      Wellness: { color: C.wellness, visible: true },
      Salon: { color: C.talk, visible: true },
      Workshop: { color: C.workshop, visible: true },
      Bio: { color: C.bio, visible: true },
      Meal: { color: C.meal, visible: true },
      Nature: { color: C.nature, visible: true },
      Social: { color: C.social, visible: true },
      Dance: { color: '#ff6b9d', visible: true }
    };
    var mergedStyles = Object.assign(
      {},
      gl.layerStylesByCategory && typeof gl.layerStylesByCategory === 'object' ? gl.layerStylesByCategory : {},
      styles
    );
    gl.ingestEvents(LAYER_ID, vevents, {
      sessionId: 'edge-esmeralda-2026-w1',
      layerStyles: mergedStyles
    });
    if (typeof global.refreshCalendarLayersList === 'function') global.refreshCalendarLayersList();
    if (typeof global.refreshEventsList === 'function') global.refreshEventsList(false);
    return vevents.length;
  }

  global.edgeEsmeraldaWeek1SampleEvents = events;
  global.edgeEsmeraldaWeek1LayerId = LAYER_ID;
  global.loadEdgeEsmeraldaWeek1Samples = loadEdgeEsmeraldaWeek1Samples;
})(typeof window !== 'undefined' ? window : this);
