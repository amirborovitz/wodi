import type { MovementRegistryEntry } from './movementRegistry';

/**
 * Cold-start snapshot of the movement registry.
 *
 * Firestore (`movementRegistry`) is the source of truth — this is the copy the
 * app boots with so a recap never blanks out waiting on a network read, and so
 * tests run without Firestore. Regenerate it from Firestore rather than editing
 * both by hand; new movements should arrive by triaging `movementFlags`.
 *
 * COMPOUND MOVEMENTS GET THEIR OWN ENTRY. Resolution falls back to longest-phrase
 * matching, which would file "Burpee Box Jump Over" under Box Jump (3 words) over
 * Burpee (1). An explicit entry is an exact hit and settles it — and unlike the
 * old order-dependent table, adding one can't disturb anything else.
 */
export const MOVEMENT_REGISTRY_SEED: MovementRegistryEntry[] = [
  // ── Clean ──────────────────────────────────────────────────────────────────
  { canonicalName: 'Clean', family: 'clean' },
  { canonicalName: 'Power Clean', family: 'clean', variant: 'Power' },
  { canonicalName: 'Squat Clean', family: 'clean', variant: 'Squat' },
  { canonicalName: 'Hang Clean', family: 'clean', variant: 'Hang' },
  { canonicalName: 'Hang Power Clean', family: 'clean', variant: 'Hang Power' },
  { canonicalName: 'Muscle Clean', family: 'clean', variant: 'Muscle' },
  { canonicalName: 'Dumbbell Clean', family: 'clean', implement: 'dumbbell', aliases: ['db clean'] },
  { canonicalName: 'Kettlebell Clean', family: 'clean', implement: 'kettlebell', aliases: ['kb clean'] },

  // ── Clean & Jerk ───────────────────────────────────────────────────────────
  // "Clean & Jerk" already normalizes to "clean jerk", so that spelling needs no alias.
  { canonicalName: 'Clean & Jerk', family: 'clean_and_jerk', aliases: ['c&j', 'cnj'] },

  // ── Snatch ─────────────────────────────────────────────────────────────────
  { canonicalName: 'Snatch', family: 'snatch' },
  { canonicalName: 'Power Snatch', family: 'snatch', variant: 'Power' },
  { canonicalName: 'Squat Snatch', family: 'snatch', variant: 'Squat' },
  { canonicalName: 'Hang Snatch', family: 'snatch', variant: 'Hang' },
  { canonicalName: 'Hang Power Snatch', family: 'snatch', variant: 'Hang Power' },
  { canonicalName: 'Muscle Snatch', family: 'snatch', variant: 'Muscle' },
  { canonicalName: 'Dumbbell Snatch', family: 'snatch', implement: 'dumbbell', aliases: ['db snatch'] },
  { canonicalName: 'Kettlebell Snatch', family: 'snatch', implement: 'kettlebell', aliases: ['kb snatch'] },

  // ── Shoulder to Overhead ───────────────────────────────────────────────────
  // No bare "press" anywhere — it would swallow Bench / Floor / Leg / Devil Press.
  { canonicalName: 'Shoulder to Overhead', family: 'shoulder_to_overhead', aliases: ['s2o', 'sto', 'shoulder 2 overhead'] },
  { canonicalName: 'Push Press', family: 'shoulder_to_overhead', variant: 'Push Press' },
  { canonicalName: 'Push Jerk', family: 'shoulder_to_overhead', variant: 'Push Jerk' },
  { canonicalName: 'Split Jerk', family: 'shoulder_to_overhead', variant: 'Split Jerk' },
  { canonicalName: 'Jerk', family: 'shoulder_to_overhead', variant: 'Jerk' },
  { canonicalName: 'Strict Press', family: 'shoulder_to_overhead', variant: 'Strict Press' },
  { canonicalName: 'Shoulder Press', family: 'shoulder_to_overhead', variant: 'Shoulder Press' },
  { canonicalName: 'Military Press', family: 'shoulder_to_overhead', variant: 'Military Press' },
  { canonicalName: 'Overhead Press', family: 'shoulder_to_overhead', aliases: ['ohp'], variant: 'Overhead Press' },
  { canonicalName: 'Z Press', family: 'shoulder_to_overhead', variant: 'Z Press' },
  { canonicalName: 'Behind the Neck Press', family: 'shoulder_to_overhead', aliases: ['press behind the neck'], variant: 'Behind the Neck' },
  { canonicalName: 'Dumbbell Push Press', family: 'shoulder_to_overhead', implement: 'dumbbell', aliases: ['db push press'], variant: 'Push Press' },
  { canonicalName: 'Dumbbell Press', family: 'shoulder_to_overhead', implement: 'dumbbell', aliases: ['db press'] },
  { canonicalName: 'Kettlebell Press', family: 'shoulder_to_overhead', implement: 'kettlebell', aliases: ['kb press'] },

  // ── Thruster ───────────────────────────────────────────────────────────────
  { canonicalName: 'Thruster', family: 'thruster' },

  // ── Deadlift ───────────────────────────────────────────────────────────────
  { canonicalName: 'Deadlift', family: 'deadlift', aliases: ['dead lift'] },
  { canonicalName: 'Romanian Deadlift', family: 'deadlift', aliases: ['rdl'], variant: 'Romanian' },
  { canonicalName: 'Sumo Deadlift', family: 'deadlift', variant: 'Sumo' },
  { canonicalName: 'Stiff Leg Deadlift', family: 'deadlift', variant: 'Stiff Leg' },
  { canonicalName: 'Single Leg Deadlift', family: 'deadlift', variant: 'Single Leg' },
  { canonicalName: 'Dumbbell Deadlift', family: 'deadlift', implement: 'dumbbell', aliases: ['db deadlift'] },
  { canonicalName: 'Kettlebell Deadlift', family: 'deadlift', implement: 'kettlebell', aliases: ['kb deadlift'] },

  // Four words, so it outranks both "Sumo Deadlift" and "Deadlift" on length.
  { canonicalName: 'Sumo Deadlift High Pull', family: 'sumo_deadlift_high_pull', aliases: ['sdhp'] },

  // ── Bench Press ────────────────────────────────────────────────────────────
  { canonicalName: 'Bench Press', family: 'bench_press', aliases: ['bench'] },
  { canonicalName: 'Floor Press', family: 'bench_press', variant: 'Floor' },
  { canonicalName: 'Dumbbell Bench Press', family: 'bench_press', implement: 'dumbbell', aliases: ['db bench press'] },

  // ── Strength rows (the erg is `row_erg`, below) ─────────────────────────────
  { canonicalName: 'Bent Over Row', family: 'strength_row', variant: 'Bent Over' },
  { canonicalName: 'Pendlay Row', family: 'strength_row', variant: 'Pendlay' },
  { canonicalName: 'Barbell Row', family: 'strength_row' },
  { canonicalName: 'Renegade Row', family: 'strength_row', implement: 'dumbbell', variant: 'Renegade' },
  { canonicalName: 'Dumbbell Row', family: 'strength_row', implement: 'dumbbell', aliases: ['db row'] },
  { canonicalName: 'Seal Row', family: 'strength_row', variant: 'Seal' },

  // ── Swing ──────────────────────────────────────────────────────────────────
  { canonicalName: 'Kettlebell Swing', family: 'swing', implement: 'kettlebell', aliases: ['kb swing', 'kbs'] },
  { canonicalName: 'American Kettlebell Swing', family: 'swing', implement: 'kettlebell', aliases: ['american swing', 'akbs', 'aks'], variant: 'American' },
  { canonicalName: 'Russian Kettlebell Swing', family: 'swing', implement: 'kettlebell', aliases: ['russian swing', 'rkbs', 'rks'], variant: 'Russian' },
  { canonicalName: 'Dumbbell Swing', family: 'swing', implement: 'dumbbell', aliases: ['db swing'] },

  // ── Other loaded work ──────────────────────────────────────────────────────
  { canonicalName: 'Good Morning', family: 'good_morning' },
  { canonicalName: 'Hip Thrust', family: 'hip_thrust' },
  { canonicalName: 'Dumbbell Hip Thrust', family: 'hip_thrust', implement: 'dumbbell', aliases: ['db hip thrust'] },
  { canonicalName: 'Glute Bridge', family: 'hip_thrust', implement: 'bodyweight', variant: 'Glute Bridge' },
  { canonicalName: 'Bicep Curl', family: 'curl', implement: 'dumbbell' },
  { canonicalName: 'Hammer Curl', family: 'curl', implement: 'dumbbell', variant: 'Hammer' },
  { canonicalName: 'Barbell Curl', family: 'curl', implement: 'barbell' },
  // "Farmers Carry" needs no alias — singularization already folds it in.
  { canonicalName: 'Farmer Carry', family: 'carry', aliases: ['farmer walk'], variant: 'Farmer' },
  { canonicalName: 'Front Rack Carry', family: 'carry', variant: 'Front Rack' },
  { canonicalName: 'Overhead Carry', family: 'carry', variant: 'Overhead' },
  { canonicalName: 'Suitcase Carry', family: 'carry', variant: 'Suitcase' },
  { canonicalName: 'Sandbag Carry', family: 'carry', variant: 'Sandbag' },
  { canonicalName: 'Yoke Carry', family: 'carry', variant: 'Yoke' },

  // ── Squat (pattern-first: implement is a variant, not an identity) ──────────
  { canonicalName: 'Squat', family: 'squat' },
  { canonicalName: 'Air Squat', family: 'squat', implement: 'bodyweight', variant: 'Air' },
  { canonicalName: 'Back Squat', family: 'squat', implement: 'barbell', variant: 'Back' },
  { canonicalName: 'Front Squat', family: 'squat', implement: 'barbell', variant: 'Front' },
  { canonicalName: 'Overhead Squat', family: 'squat', implement: 'barbell', aliases: ['ohs'], variant: 'Overhead' },
  { canonicalName: 'Goblet Squat', family: 'squat', implement: 'kettlebell', variant: 'Goblet' },
  { canonicalName: 'Sissy Squat', family: 'squat', implement: 'bodyweight', variant: 'Sissy' },
  { canonicalName: 'Bulgarian Split Squat', family: 'squat', variant: 'Bulgarian Split' },
  { canonicalName: 'Split Squat', family: 'squat', variant: 'Split' },
  { canonicalName: 'Squat Jump', family: 'squat', implement: 'bodyweight', aliases: ['jump squat'], variant: 'Jump' },
  { canonicalName: 'Wall Sit', family: 'squat', implement: 'bodyweight', variant: 'Wall Sit' },

  { canonicalName: 'Pistol', family: 'pistol', aliases: ['single leg squat', 'pistol squat'] },

  // ── Lunge / step-up ────────────────────────────────────────────────────────
  { canonicalName: 'Lunge', family: 'lunge' },
  { canonicalName: 'Walking Lunge', family: 'lunge', variant: 'Walking' },
  { canonicalName: 'Jumping Lunge', family: 'lunge', implement: 'bodyweight', variant: 'Jumping' },
  { canonicalName: 'Reverse Lunge', family: 'lunge', variant: 'Reverse' },
  { canonicalName: 'Step-up', family: 'step_up', aliases: ['box step up'] },

  // ── Gymnastics / bodyweight ────────────────────────────────────────────────
  { canonicalName: 'Box Jump', family: 'box_jump' },
  { canonicalName: 'Box Jump Over', family: 'box_jump', aliases: ['bjo'], variant: 'Over' },

  { canonicalName: 'Burpee', family: 'burpee' },
  { canonicalName: 'Burpee Box Jump Over', family: 'burpee', variant: 'Box Jump Over' },
  { canonicalName: 'Burpee Box Jump', family: 'burpee', variant: 'Box Jump' },
  { canonicalName: 'Burpee Over the Bar', family: 'burpee', aliases: ['burpee over bar', 'bar facing burpee'], variant: 'Over the Bar' },
  { canonicalName: 'Burpee Over Dumbbell', family: 'burpee', variant: 'Over Dumbbell' },
  { canonicalName: 'Burpee to Deadlift', family: 'burpee', variant: 'to Deadlift' },
  { canonicalName: 'Burpee Pull-up', family: 'burpee', variant: 'Pull-up' },

  { canonicalName: 'Push-up', family: 'push_up', aliases: ['hrpu', 'hand release push up'] },
  { canonicalName: 'Ring Push-up', family: 'push_up', variant: 'Ring' },
  { canonicalName: 'Deficit Push-up', family: 'push_up', variant: 'Deficit' },

  { canonicalName: 'Pull-up', family: 'pull_up' },
  { canonicalName: 'Chest to Bar Pull-up', family: 'pull_up', aliases: ['c2b', 'ctb', 'chest to bar'], variant: 'Chest to Bar' },
  { canonicalName: 'Chin-up', family: 'pull_up', variant: 'Chin' },
  { canonicalName: 'Jumping Pull-up', family: 'pull_up', variant: 'Jumping' },
  // `strict` / `kipping` / `butterfly` are MODIFIER_WORDS, stripped before lookup —
  // which is right for most movements and wrong here, where the kip IS the
  // distinction a CrossFitter cares about. An explicit entry is an exact hit and
  // resolves before any stripping, so these three keep their own sub-line.
  { canonicalName: 'Strict Pull-up', family: 'pull_up', variant: 'Strict' },
  { canonicalName: 'Kipping Pull-up', family: 'pull_up', variant: 'Kipping' },
  { canonicalName: 'Butterfly Pull-up', family: 'pull_up', variant: 'Butterfly' },

  { canonicalName: 'Dip', family: 'dip' },
  { canonicalName: 'Ring Dip', family: 'dip', variant: 'Ring' },
  { canonicalName: 'Parallette Dip', family: 'dip', aliases: ['bar dip'], variant: 'Parallette' },

  { canonicalName: 'Toes to Bar', family: 'toes_to_bar', aliases: ['t2b', 'ttb', 'toes 2 bar'] },
  { canonicalName: 'Knees to Elbow', family: 'toes_to_bar', aliases: ['k2e', 'kte'], variant: 'Knees to Elbow' },

  { canonicalName: 'Muscle-up', family: 'muscle_up' },
  { canonicalName: 'Bar Muscle-up', family: 'muscle_up', aliases: ['bmu'], variant: 'Bar' },
  { canonicalName: 'Ring Muscle-up', family: 'muscle_up', aliases: ['rmu'], variant: 'Ring' },

  { canonicalName: 'Handstand Push-up', family: 'handstand_push_up', aliases: ['hspu'] },
  // Same reasoning as the strict pull-up: a strict HSPU is its own achievement.
  { canonicalName: 'Strict Handstand Push-up', family: 'handstand_push_up', aliases: ['strict hspu'], variant: 'Strict' },
  { canonicalName: 'Deficit Handstand Push-up', family: 'handstand_push_up', aliases: ['deficit hspu'], variant: 'Deficit' },
  { canonicalName: 'Handstand Walk', family: 'handstand_walk', aliases: ['handstand hold', 'handstand'] },
  { canonicalName: 'Wall Walk', family: 'wall_walk' },
  { canonicalName: 'Wall Ball', family: 'wall_ball', aliases: ['wallball'] },
  { canonicalName: 'Ring Row', family: 'ring_row' },
  { canonicalName: 'Rope Climb', family: 'rope_climb' },
  { canonicalName: 'Legless Rope Climb', family: 'rope_climb', variant: 'Legless' },
  { canonicalName: 'Sit-up', family: 'sit_up' },
  { canonicalName: 'GHD Sit-up', family: 'sit_up', variant: 'GHD' },
  { canonicalName: 'Double Under', family: 'double_under', aliases: ['du', 'dubs'] },
  { canonicalName: 'Single Under', family: 'single_under', aliases: ['su', 'singles'] },
  { canonicalName: 'Devil Press', family: 'devil_press' },
  { canonicalName: 'Man Maker', family: 'man_maker', aliases: ['manmaker'] },
  { canonicalName: 'Turkish Get-up', family: 'turkish_get_up', aliases: ['tgu'] },

  // ── Core ───────────────────────────────────────────────────────────────────
  // Midline accessories nobody names individually. One "CORE" row beats six rows
  // of 30. Sit-ups keep their own family — those people do brag about.
  { canonicalName: 'Russian Twist', family: 'core', variant: 'Russian Twist' },
  { canonicalName: 'Bicycle Crunch', family: 'core', variant: 'Bicycle Crunch' },
  { canonicalName: 'Hollow Rock', family: 'core', variant: 'Hollow Rock' },
  { canonicalName: 'Hollow Hold', family: 'core', variant: 'Hollow Hold' },
  { canonicalName: 'Flutter Kick', family: 'core', variant: 'Flutter Kick' },
  { canonicalName: 'V-up', family: 'core', variant: 'V-up' },
  { canonicalName: 'Leg Raise', family: 'core', variant: 'Leg Raise' },
  { canonicalName: 'Pike Leg Raise', family: 'core', variant: 'Pike Leg Raise' },
  { canonicalName: 'Plank', family: 'core', variant: 'Plank' },
  { canonicalName: 'Side Plank Hip Raise', family: 'core', variant: 'Side Plank' },
  // A spinal-flexion mobility drill, NOT a bicep curl. The explicit entry is an
  // exact hit, so it never falls through to the `curl` family on the word "curl".
  { canonicalName: 'Jefferson Curl', family: 'core', variant: 'Jefferson Curl' },
  // Lateral mobility work despite the name. The explicit entry is an exact hit,
  // so "squat" in the name never pulls it into the Squat family.
  { canonicalName: 'Cossack Squat', family: 'core', implement: 'bodyweight', variant: 'Cossack Squat' },

  // ── Shoulder prehab ────────────────────────────────────────────────────────
  { canonicalName: 'Shoulder External Rotation', family: 'shoulder_prehab', variant: 'External Rotation' },
  { canonicalName: 'Shoulder Internal Rotation', family: 'shoulder_prehab', variant: 'Internal Rotation' },
  { canonicalName: 'Prone T Raise', family: 'shoulder_prehab', variant: 'Prone T Raise' },
  { canonicalName: 'Powell Raise', family: 'shoulder_prehab', variant: 'Powell Raise' },
  { canonicalName: 'Chicken Wing', family: 'shoulder_prehab', variant: 'Chicken Wing' },
  { canonicalName: 'Face Pull', family: 'shoulder_prehab', variant: 'Face Pull' },

  // ── Cardio ─────────────────────────────────────────────────────────────────
  // The bikes stay APART at the canonical grain even though they share one family:
  // an Echo and a BikeErg are different machines, and the recap's engine card names
  // the machine you were actually on. They still roll up into one "Bike" row.
  { canonicalName: 'Echo Bike', family: 'bike', aliases: ['echo'] },
  { canonicalName: 'Assault Bike', family: 'bike', aliases: ['assault'] },
  { canonicalName: 'Air Bike', family: 'bike', aliases: ['airdyne'] },
  { canonicalName: 'BikeErg', family: 'bike', aliases: ['bike erg'] },
  { canonicalName: 'Bike', family: 'bike', aliases: ['stationary bike'] },
  { canonicalName: 'Ski', family: 'ski', aliases: ['ski erg', 'skierg'] },
  { canonicalName: 'Run', family: 'run', aliases: ['running', 'sprint', 'jog', 'treadmill', 'air runner', 'airrunner', 'shuttle run'] },
  { canonicalName: 'Swim', family: 'swim', aliases: ['swimming'] },
  // Exact-only: "Row" alone is the erg, but "Bent Over Row" and "Ring Row" are
  // not. No word-boundary rule separates them, so the erg matches whole-name only.
  { canonicalName: 'Row', family: 'row_erg', aliases: ['rower', 'rowing', 'row erg', 'rowerg', 'erg', 'concept 2', 'concept2', 'c2'], exactOnly: true },
];
