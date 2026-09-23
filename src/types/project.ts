export type MediaType = 'video' | 'image' | 'audio';
export type FitMode = 'cover' | 'contain' | 'custom';

export interface CropRect {
  x: number;      // 0 to 1 (normalized horizontal offset on source)
  y: number;      // 0 to 1 (normalized vertical offset on source)
  width: number;  // 0 to 1 (normalized crop width on source)
  height: number; // 0 to 1 (normalized crop height on source)
}

export interface TransformState {
  x: number;          // Pan X offset in percentage (-50% to +50%)
  y: number;          // Pan Y offset in percentage (-50% to +50%)
  scale: number;      // Zoom scale multiplier (1.0 = standard fit, up to 5.0)
  fitMode: FitMode;   // 'cover' fills 16:9 frame, 'contain' shows full media with letterbox, 'custom' allows freeform crop
  crop: CropRect;     // Normalized 16:9 crop window
}

export interface MediaKeyframe {
  time: number;          // Timestamp in seconds
  imageData?: string;    // Transient thumbnail data URL (stripped in portable JSON export)
  description?: string;  // Frame-level semantic description
  tags?: string[];       // Frame-level semantic tags
  ocrText?: string;      // Frame-level local OCR extracted text
  ocrConfidence?: number;// Frame-level OCR confidence [0.0, 1.0]
  isKeyMoment?: boolean; // Informative frame with high visual or semantic uniqueness
}

export interface VisualFeatures {
  dominantColors: string[]; // Hex codes (e.g. ['#2a3b4c', '#d1e2f3'])
  brightness: number;       // Normalized 0.0 (dark) to 1.0 (bright)
  contrast: number;         // Normalized 0.0 to 1.0
  orientation: 'landscape' | 'portrait' | 'square';
  hasFaces?: boolean;
  faceCount?: number;
}

export interface KeyframeSemantic {
  time: number;
  description: string;
  tags: string[];
  ocrText?: string;
  ocrConfidence?: number;
  isKeyMoment?: boolean;
}

export interface VisualChangeSegment {
  fromTime: number;
  toTime: number;
  differenceScore: number;
  description: string;
}

export interface MediaSemanticAnalysis {
  analyzed: boolean;
  description: string;                 // Concise overall description of the media
  tags: string[];                      // Top 3-10 aggregated semantic tags
  ocrText?: string;                    // Local OCR extracted text from visual scene
  ocrConfidence?: number;              // OCR confidence [0.0, 1.0]
  keyframeDescriptions?: KeyframeSemantic[]; // Frame-by-frame interpretations
  temporalSummary?: string;            // Aggregated multi-frame narrative
  hasVisualChange?: boolean;           // True if meaningful visual shift detected
  visualChanges?: VisualChangeSegment[]; // Detected visual transition segments
  modelUsed?: string;
  analyzedAt?: number;
}

export interface MediaAnalysis {
  analyzed: boolean;
  analyzing?: boolean;
  error?: string;
  duration?: number;
  description?: string;
  tags?: string[];
  ocrText?: string;                    // Top-level extracted OCR text
  ocrConfidence?: number;              // Top-level OCR confidence
  visualFeatures?: VisualFeatures;     // Deterministic pixel stats (brightness, contrast, colors)
  keyframes?: MediaKeyframe[];         // Representative keyframes
  semantic?: MediaSemanticAnalysis;   // Semantic scene understanding from local vision model
  analyzedAt?: number;
}

export interface MediaAsset {
  id: string;
  name: string;
  type: MediaType;
  url: string;              // In-memory Object URL (or relative path in exported project)
  file?: File;              // Browser-only File instance (never exported to JSON)
  width: number;
  height: number;
  duration: number;         // In seconds (0 for images)
  aspectRatio: number;      // width / height
  aspectRatioLabel: string; // e.g. "9:16 Vertical", "16:9 Native", "1:1 Square", "4:3", "21:9 Ultrawide"
  size?: number;            // in bytes
  analysis?: MediaAnalysis; // Local media intelligence & semantic analysis
  createdAt: number;
}

export type NarrationRole =
  | 'establishing'
  | 'action'
  | 'description'
  | 'transition'
  | 'result'
  | 'continuation'
  | 'emphasis'
  | 'unknown';

export type NarrationBeatType =
  | 'NEW_BEAT'
  | 'CONTINUING_BEAT'
  | 'BEAT_END'
  | 'STANDALONE';

export type PacingClass = 'QUICK' | 'NORMAL' | 'LINGERING';

export type VisualState = 'STATIC' | 'STABLE' | 'DYNAMIC' | 'HIGH_IMPACT';

export type SubjectContinuityLevel = 'HIGH' | 'MODERATE' | 'LOW';

export type FramingScale = 'WIDE' | 'MEDIUM' | 'CLOSEUP' | 'DETAIL' | 'STANDARD';
export type FramingIntent = 'WIDE' | 'CLOSEUP' | 'DETAIL' | 'DYNAMIC' | 'NEUTRAL';

export type AtmosphericTone = 'WARM_VIBRANT' | 'COOL_MUTED' | 'HIGH_KEY_BRIGHT' | 'LOW_KEY_DARK' | 'NEUTRAL_BALANCED';
export type AtmosphericIntent = 'WARM' | 'COOL' | 'BRIGHT' | 'DARK' | 'NEUTRAL';

export type CameraMotion = 'STATIC_LOCKED' | 'PANNING_SWEEP' | 'ZOOMING_FOCUS' | 'DYNAMIC_ACTION' | 'SMOOTH_FLOAT';
export type MotionIntent = 'STATIC' | 'PAN' | 'ZOOM' | 'ACTION' | 'SMOOTH' | 'NEUTRAL';

export type SceneSetting = 'INDOOR_INTERIOR' | 'OUTDOOR_NATURAL' | 'OUTDOOR_URBAN' | 'STUDIO_ABSTRACT' | 'NEUTRAL_SETTING';
export type SettingIntent = 'INDOOR' | 'NATURE' | 'URBAN' | 'ABSTRACT' | 'NEUTRAL';

export type SubjectDensity = 'SOLO_INDIVIDUAL' | 'DUO_INTERACTION' | 'GROUP_TEAM' | 'CROWD_AUDIENCE' | 'UNINHABITED_OBJECT';
export type DensityIntent = 'SOLO' | 'DUO' | 'GROUP' | 'CROWD' | 'EMPTY' | 'NEUTRAL';

export type CameraAngle = 'AERIAL_OVERHEAD' | 'HIGH_ANGLE' | 'EYE_LEVEL' | 'LOW_ANGLE' | 'GROUND_LEVEL';
export type AngleIntent = 'AERIAL' | 'HIGH' | 'EYE' | 'LOW' | 'GROUND' | 'NEUTRAL';

export type TimeOfDay = 'DAYLIGHT_CLEAR' | 'GOLDEN_HOUR_SUNSET' | 'NIGHT_NOCTURNAL' | 'DAWN_TWILIGHT' | 'TIME_AGNOSTIC';
export type TimeIntent = 'DAY' | 'SUNSET' | 'NIGHT' | 'DAWN' | 'NEUTRAL';

export type WeatherCondition = 'CLEAR_FAIR' | 'OVERCAST_CLOUDY' | 'RAIN_STORMY' | 'SNOW_FROST' | 'FOG_MIST' | 'WEATHER_AGNOSTIC';
export type WeatherIntent = 'CLEAR' | 'OVERCAST' | 'RAIN' | 'SNOW' | 'FOG' | 'NEUTRAL';

export type DepthOfField = 'SHALLOW_BOKEH' | 'DEEP_FOCUS' | 'RACK_FOCUS' | 'SOFT_DREAMY' | 'DEPTH_AGNOSTIC';
export type DepthIntent = 'SHALLOW' | 'DEEP' | 'RACK' | 'SOFT' | 'NEUTRAL';

export type TemporalRate = 'REALTIME_STANDARD' | 'SLOW_MOTION' | 'TIMELAPSE_HYPERLAPSE' | 'STOP_MOTION_FREEZE' | 'TEMPORAL_AGNOSTIC';
export type TemporalIntent = 'REALTIME' | 'SLOW_MO' | 'TIMELAPSE' | 'FREEZE' | 'NEUTRAL';

export type VisualMedium =
  | 'LIVE_ACTION_REALISM'
  | 'SCREENCAST_UI'
  | 'ANIMATION_2D'
  | 'CGI_3D_RENDER'
  | 'ABSTRACT_GRAPHIC'
  | 'MEDIUM_AGNOSTIC';
export type MediumIntent = 'LIVE_ACTION' | 'SCREENCAST' | 'ANIMATION' | 'CGI_3D' | 'ABSTRACT' | 'NEUTRAL';

export type CompositionBalance =
  | 'CENTERED_SYMMETRIC'
  | 'RULE_OF_THIRDS_LEFT'
  | 'RULE_OF_THIRDS_RIGHT'
  | 'DISTRIBUTED_BALANCED'
  | 'COMPOSITION_AGNOSTIC';
export type CompositionIntent = 'CENTER' | 'LEFT' | 'RIGHT' | 'DISTRIBUTED' | 'NEUTRAL';

export type LightingSetup =
  | 'FRONTAL_DIRECT'
  | 'SIDE_SPLIT_DRAMATIC'
  | 'BACKLIT_SILHOUETTE'
  | 'TOP_DOWN_OVERHEAD'
  | 'DIFFUSE_AMBIENT'
  | 'LIGHTING_AGNOSTIC';
export type LightingIntent = 'FRONTAL' | 'SIDE_DRAMATIC' | 'BACKLIT' | 'OVERHEAD' | 'DIFFUSE' | 'NEUTRAL';

export type PointOfView =
  | 'FIRST_PERSON_POV'
  | 'OVER_THE_SHOULDER'
  | 'DIRECT_ADDRESS'
  | 'OBJECTIVE_OBSERVATIONAL'
  | 'POV_AGNOSTIC';
export type POVIntent = 'FIRST_PERSON' | 'OVER_THE_SHOULDER' | 'DIRECT_ADDRESS' | 'OBSERVATIONAL' | 'NEUTRAL';

export type ChromaticGrading =
  | 'MONOCHROME_GRAYSCALE'
  | 'VIBRANT_SATURATED'
  | 'MUTED_DESATURATED'
  | 'WARM_SEPIA_DUOTONE'
  | 'NATURAL_BALANCED'
  | 'CHROMATIC_AGNOSTIC';
export type ChromaticIntent = 'MONOCHROME' | 'VIBRANT' | 'MUTED' | 'SEPIA_DUOTONE' | 'NATURAL' | 'NEUTRAL';

export type ActionTrajectory =
  | 'APPROACHING_CAMERA'
  | 'RECEDING_DEPTH'
  | 'LATERAL_LEFT_TO_RIGHT'
  | 'LATERAL_RIGHT_TO_LEFT'
  | 'ROTATIONAL_AXIAL'
  | 'TRAJECTORY_AGNOSTIC';
export type TrajectoryIntent = 'APPROACHING' | 'RECEDING' | 'LEFT_TO_RIGHT' | 'RIGHT_TO_LEFT' | 'ROTATIONAL' | 'NEUTRAL';

export type OpticalLensPerspective =
  | 'FISHEYE_ULTRAWIDE'
  | 'WIDE_ANGLE_EXPANSIVE'
  | 'STANDARD_NORMAL'
  | 'TELEPHOTO_COMPRESSED'
  | 'MACRO_MICROSCOPIC'
  | 'LENS_AGNOSTIC';
export type LensIntent = 'FISHEYE' | 'WIDE' | 'NORMAL' | 'TELEPHOTO' | 'MACRO' | 'NEUTRAL';

export type VisualTexture =
  | 'CLEAN_PRISTINE_DIGITAL'
  | 'ORGANIC_FILM_GRAIN'
  | 'VINTAGE_ANALOG_VHS'
  | 'GRITTY_TEXTURED_NOISE'
  | 'ETHEREAL_DIFFUSION_GLOW'
  | 'TEXTURE_AGNOSTIC';
export type TextureIntent = 'PRISTINE_DIGITAL' | 'FILM_GRAIN' | 'ANALOG_VHS' | 'GRITTY_NOISE' | 'DIFFUSION_GLOW' | 'NEUTRAL';

export interface DraftProvenance {
  sourceSegmentId: string;
  sourceSegmentText?: string;
  originalScore: number;          // Raw semantic similarity (e.g. 0.71)
  adjustedScore: number;          // Composite score after penalties/bonuses
  explanation: string;            // Deterministic reason
  reuseCount: number;             // Number of previous uses (0 for 1st use)
  continuityBonus?: number;       // Continuity bonus added
  temporalBonus?: number;         // Step 16: Total temporal bonus applied
  isKeyMoment?: boolean;          // Step 16: Aligns with a key moment keyframe
  hasVisualChange?: boolean;      // Step 16: Corresponds to dynamic visual changes in footage
  temporalCoverageCount?: number; // Step 16: Number of distinct keyframes with concept coverage
  selectedSourceTimestamp?: number;     // Step 17: AI-selected source start in seconds
  temporalSelectionReason?: string;     // Step 17: Deterministic reason for source start selection
  originalSegmentDuration?: number;     // Step 18: Original duration of the transcript segment in seconds
  selectedDuration?: number;            // Step 18: AI-refined duration on the timeline
  durationAdjustmentReason?: string;    // Step 18: Deterministic reason for duration refinement
  continuityReason?: string;            // Step 19: Transition & continuity explanation with previous shot
  isConsecutiveContinuation?: boolean;  // Step 19: True if this shot is a legitimate continuation of same media
  narrationRole?: NarrationRole;        // Step 20: Classified structural narration role
  narrationRoleReason?: string;         // Step 20: Deterministic linguistic reason
  narrationBeatType?: NarrationBeatType;// Step 21: Beat position classification (NEW_BEAT, CONTINUING_BEAT, BEAT_END, STANDALONE)
  beatId?: string;                      // Step 21: Deterministic beat ID (e.g. 'beat-0')
  beatPosition?: number;                // Step 21: 1-indexed position in beat (e.g. 1)
  beatLength?: number;                  // Step 21: Total segments in beat (e.g. 3)
  beatReason?: string;                  // Step 21: Deterministic beat heuristic reason
  visualVarietyModifier?: number;       // Step 22: Visual variety / anti-repetition score modifier
  visualSimilarity?: number;            // Step 22: Normalized deterministic visual similarity [0.0, 1.0]
  visualVarietyReason?: string;         // Step 22: Deterministic visual variety reason
  pacingModifier?: number;              // Step 23: Pacing & shot rhythm score modifier [-0.010, +0.010]
  pacingClass?: PacingClass;            // Step 23: Classified pacing category (QUICK, NORMAL, LINGERING)
  pacingReason?: string;                // Step 23: Deterministic pacing reason
  pacingArcModifier?: number;           // Step 24: Pacing arc score modifier [-0.008, +0.008]
  pacingArcReason?: string;             // Step 24: Deterministic pacing arc explanation
  visualImpactScore?: number;           // Step 25: Normalized visual impact score [0.0, 1.0]
  emphasisImpactModifier?: number;      // Step 25: Narration emphasis impact modifier [-0.008, +0.008]
  emphasisImpactReason?: string;        // Step 25: Deterministic emphasis impact reason
  visualState?: VisualState;            // Step 26: Classified visual state (STATIC, STABLE, DYNAMIC, HIGH_IMPACT)
  narrationVisualContrastModifier?: number; // Step 26: Narration-visual contrast modifier [-0.008, +0.008]
  narrationVisualContrastReason?: string;   // Step 26: Deterministic contrast compatibility reason
  subjectContinuityModifier?: number;   // Step 27: Subject continuity score modifier [-0.008, +0.008]
  subjectContinuity?: SubjectContinuityLevel; // Step 27: Classified subject continuity (HIGH, MODERATE, LOW)
  subjectContinuityReason?: string;     // Step 27: Deterministic subject continuity explanation
  subjectMatchScore?: number;           // Step 27: Normalized media subject token match score [0.0, 1.0]
  framingScale?: FramingScale;          // Step 28: Classified framing/composition scale (WIDE, MEDIUM, CLOSEUP, DETAIL, STANDARD)
  framingModifier?: number;             // Step 28: Framing & composition scale score modifier [-0.008, +0.008]
  framingReason?: string;               // Step 28: Deterministic framing scale explanation
  framingMatchScore?: number;           // Step 28: Normalized framing compatibility score [0.0, 1.0]
  atmosphericTone?: AtmosphericTone;    // Step 29: Classified lighting & atmospheric color tone
  atmosphericModifier?: number;         // Step 29: Atmospheric lighting & tonality score modifier [-0.008, +0.008]
  atmosphericReason?: string;           // Step 29: Deterministic atmospheric lighting explanation
  atmosphericMatchScore?: number;       // Step 29: Normalized atmospheric compatibility score [0.0, 1.0]
  cameraMotion?: CameraMotion;          // Step 30: Classified camera movement & kinetic dynamics (STATIC_LOCKED, PANNING_SWEEP, ZOOMING_FOCUS, DYNAMIC_ACTION, SMOOTH_FLOAT)
  motionModifier?: number;              // Step 30: Camera motion & kinetic dynamics score modifier [-0.008, +0.008]
  motionReason?: string;                // Step 30: Deterministic kinetic motion explanation
  motionMatchScore?: number;            // Step 30: Normalized camera motion compatibility score [0.0, 1.0]
  sceneSetting?: SceneSetting;          // Step 31: Classified spatial environment & scene setting (INDOOR_INTERIOR, OUTDOOR_NATURAL, OUTDOOR_URBAN, STUDIO_ABSTRACT, NEUTRAL_SETTING)
  settingModifier?: number;             // Step 31: Spatial environment & scene setting score modifier [-0.008, +0.008]
  settingReason?: string;               // Step 31: Deterministic spatial environment explanation
  settingMatchScore?: number;           // Step 31: Normalized spatial setting compatibility score [0.0, 1.0]
  subjectDensity?: SubjectDensity;      // Step 32: Classified human subject presence & social density (SOLO_INDIVIDUAL, DUO_INTERACTION, GROUP_TEAM, CROWD_AUDIENCE, UNINHABITED_OBJECT)
  densityModifier?: number;             // Step 32: Subject presence & social density score modifier [-0.008, +0.008]
  densityReason?: string;               // Step 32: Deterministic subject presence & density explanation
  densityMatchScore?: number;           // Step 32: Normalized subject density compatibility score [0.0, 1.0]
  cameraAngle?: CameraAngle;            // Step 33: Classified camera angle & vertical perspective (AERIAL_OVERHEAD, HIGH_ANGLE, EYE_LEVEL, LOW_ANGLE, GROUND_LEVEL)
  angleModifier?: number;               // Step 33: Camera angle & vertical perspective score modifier [-0.008, +0.008]
  angleReason?: string;                 // Step 33: Deterministic camera angle explanation
  angleMatchScore?: number;             // Step 33: Normalized camera angle compatibility score [0.0, 1.0]
  timeOfDay?: TimeOfDay;                // Step 34: Classified time of day & chronological lighting phase (DAYLIGHT_CLEAR, GOLDEN_HOUR_SUNSET, NIGHT_NOCTURNAL, DAWN_TWILIGHT, TIME_AGNOSTIC)
  timeModifier?: number;                // Step 34: Time of day & chronological lighting score modifier [-0.008, +0.008]
  timeReason?: string;                  // Step 34: Deterministic time of day explanation
  timeMatchScore?: number;              // Step 34: Normalized time of day compatibility score [0.0, 1.0]
  weatherCondition?: WeatherCondition;  // Step 35: Classified meteorological & atmospheric weather condition (CLEAR_FAIR, OVERCAST_CLOUDY, RAIN_STORMY, SNOW_FROST, FOG_MIST, WEATHER_AGNOSTIC)
  weatherModifier?: number;             // Step 35: Weather & atmospheric condition score modifier [-0.008, +0.008]
  weatherReason?: string;               // Step 35: Deterministic weather & atmosphere explanation
  weatherMatchScore?: number;           // Step 35: Normalized weather compatibility score [0.0, 1.0]
  depthOfField?: DepthOfField;          // Step 36: Classified optical depth of field & focus plane (SHALLOW_BOKEH, DEEP_FOCUS, RACK_FOCUS, SOFT_DREAMY, DEPTH_AGNOSTIC)
  depthModifier?: number;               // Step 36: Depth of field & optical focus plane score modifier [-0.008, +0.008]
  depthReason?: string;                 // Step 36: Deterministic depth of field explanation
  depthMatchScore?: number;             // Step 36: Normalized depth of field compatibility score [0.0, 1.0]
  temporalRate?: TemporalRate;          // Step 37: Classified temporal motion rate & playback speed (REALTIME_STANDARD, SLOW_MOTION, TIMELAPSE_HYPERLAPSE, STOP_MOTION_FREEZE, TEMPORAL_AGNOSTIC)
  temporalModifier?: number;            // Step 37: Temporal motion rate & playback speed score modifier [-0.008, +0.008]
  temporalReason?: string;              // Step 37: Deterministic temporal playback speed explanation
  temporalMatchScore?: number;          // Step 37: Normalized temporal rate compatibility score [0.0, 1.0]
  visualMedium?: VisualMedium;          // Step 38: Classified visual medium & render style (LIVE_ACTION_REALISM, SCREENCAST_UI, ANIMATION_2D, CGI_3D_RENDER, ABSTRACT_GRAPHIC, MEDIUM_AGNOSTIC)
  mediumModifier?: number;              // Step 38: Visual medium & render style score modifier [-0.008, +0.008]
  mediumReason?: string;                // Step 38: Deterministic visual medium explanation
  mediumMatchScore?: number;            // Step 38: Normalized visual medium compatibility score [0.0, 1.0]
  compositionBalance?: CompositionBalance; // Step 39: Classified compositional balance & screen alignment (CENTERED_SYMMETRIC, RULE_OF_THIRDS_LEFT, RULE_OF_THIRDS_RIGHT, DISTRIBUTED_BALANCED, COMPOSITION_AGNOSTIC)
  compositionModifier?: number;         // Step 39: Compositional balance & screen alignment score modifier [-0.008, +0.008]
  compositionReason?: string;           // Step 39: Deterministic compositional balance explanation
  compositionMatchScore?: number;       // Step 39: Normalized compositional balance compatibility score [0.0, 1.0]
  lightingSetup?: LightingSetup;        // Step 40: Classified lighting setup & key illumination (FRONTAL_DIRECT, SIDE_SPLIT_DRAMATIC, BACKLIT_SILHOUETTE, TOP_DOWN_OVERHEAD, DIFFUSE_AMBIENT, LIGHTING_AGNOSTIC)
  lightingModifier?: number;            // Step 40: Lighting setup & key illumination score modifier [-0.008, +0.008]
  lightingReason?: string;              // Step 40: Deterministic lighting setup explanation
  lightingMatchScore?: number;          // Step 40: Normalized lighting setup compatibility score [0.0, 1.0]
  pointOfView?: PointOfView;            // Step 41: Classified camera point-of-view & observer perspective (FIRST_PERSON_POV, OVER_THE_SHOULDER, DIRECT_ADDRESS, OBJECTIVE_OBSERVATIONAL, POV_AGNOSTIC)
  povModifier?: number;                 // Step 41: Camera point-of-view & perspective score modifier [-0.008, +0.008]
  povReason?: string;                   // Step 41: Deterministic point-of-view explanation
  povMatchScore?: number;               // Step 41: Normalized point-of-view compatibility score [0.0, 1.0]
  chromaticGrading?: ChromaticGrading;  // Step 42: Classified chromatic saturation & color grading (MONOCHROME_GRAYSCALE, VIBRANT_SATURATED, MUTED_DESATURATED, WARM_SEPIA_DUOTONE, NATURAL_BALANCED, CHROMATIC_AGNOSTIC)
  chromaticModifier?: number;           // Step 42: Chromatic saturation & color grading score modifier [-0.008, +0.008]
  chromaticReason?: string;             // Step 42: Deterministic chromatic saturation explanation
  chromaticMatchScore?: number;         // Step 42: Normalized chromatic grading compatibility score [0.0, 1.0]
  actionTrajectory?: ActionTrajectory;  // Step 43: Classified action trajectory & screen direction (APPROACHING_CAMERA, RECEDING_DEPTH, LATERAL_LEFT_TO_RIGHT, LATERAL_RIGHT_TO_LEFT, ROTATIONAL_AXIAL, TRAJECTORY_AGNOSTIC)
  trajectoryModifier?: number;          // Step 43: Action trajectory & screen direction score modifier [-0.008, +0.008]
  trajectoryReason?: string;            // Step 43: Deterministic action trajectory explanation
  trajectoryMatchScore?: number;        // Step 43: Normalized action trajectory compatibility score [0.0, 1.0]
  lensPerspective?: OpticalLensPerspective; // Step 44: Classified optical lens & focal perspective (FISHEYE_ULTRAWIDE, WIDE_ANGLE_EXPANSIVE, STANDARD_NORMAL, TELEPHOTO_COMPRESSED, MACRO_MICROSCOPIC, LENS_AGNOSTIC)
  lensModifier?: number;                // Step 44: Optical lens & focal perspective score modifier [-0.008, +0.008]
  lensReason?: string;                  // Step 44: Deterministic optical lens & focal perspective explanation
  lensMatchScore?: number;              // Step 44: Normalized optical lens compatibility score [0.0, 1.0]
  visualTexture?: VisualTexture;        // Step 45: Classified visual texture & surface quality (CLEAN_PRISTINE_DIGITAL, ORGANIC_FILM_GRAIN, VINTAGE_ANALOG_VHS, GRITTY_TEXTURED_NOISE, ETHEREAL_DIFFUSION_GLOW, TEXTURE_AGNOSTIC)
  textureModifier?: number;             // Step 45: Visual texture & surface quality score modifier [-0.008, +0.008]
  textureReason?: string;               // Step 45: Deterministic visual texture explanation
  textureMatchScore?: number;           // Step 45: Normalized visual texture compatibility score [0.0, 1.0]
  rawVisualIntelligence?: number;       // Step 46: Unbounded raw sum of Steps 28–45 micro-intelligence modifiers
  boundedVisualIntelligence?: number;   // Step 46: Aggregate visual intelligence modifier clamped to [-0.050, +0.050]
  visualIntelligenceBudget?: number;    // Step 46: Global visual intelligence budget constant (0.050)
  semanticRankingProtectionApplied?: boolean; // Step 47: True if semantic safety band preserved candidate over lower semantic candidate
  semanticRankingProtectionReason?: string;   // Step 47: Explanation of ranking protection invariant
  candidateConfidenceScore?: number;          // Step 48: Bounded confidence score [0, 1] derived from selection margin
  candidateConfidenceLevel?: 'HIGH' | 'MODERATE' | 'LOW'; // Step 48: Confidence tier (HIGH ≥ 0.050 margin, MODERATE ≥ 0.020, LOW < 0.020)
  selectionMargin?: number;                   // Step 48: adjustedScore gap between selected and runner-up (or selectedScore if single candidate)
  semanticMargin?: number;                    // Step 48: rawScore gap between selected and runner-up (or selectedScore if single candidate)
  semanticSeparation?: 'CLEAR' | 'CLOSE' | 'NONE'; // Step 48: Semantic clarity label (CLEAR ≥ 0.100, CLOSE > 0, NONE ≤ 0)
  visualInfluence?: 'NEUTRAL' | 'SUPPORTING' | 'OPPOSING'; // Step 48: Direction of bounded visual intelligence contribution
  matchConfidence?: 'STRONG' | 'ACCEPTABLE' | 'UNCERTAIN' | 'NO_MATCH'; // Step 49: Overall match quality state (STRONG ≥ 0.550, ACCEPTABLE ≥ 0.400, UNCERTAIN ≥ 0.300, NO_MATCH otherwise)
  matchCertainty?: 'HIGH_CERTAINTY' | 'MODERATE_CERTAINTY' | 'LOW_CERTAINTY'; // Step 49: Selection certainty derived from Step 48 confidence level
  gapReason?: 'NO_CANDIDATE' | 'BELOW_EXISTING_THRESHOLD' | 'EMPTY_TRANSCRIPT' | 'UNAVAILABLE_MEDIA' | 'UNKNOWN'; // Step 49: Reason for unassigned segment (only present on gap/NO_MATCH items if recorded)
  candidatePoolSize?: number;          // Step 50: Number of candidate media items available before final selection
  viableCandidateCount?: number;       // Step 50: Number of candidate items meeting engine viability threshold
  selectedCandidateRank?: number;      // Step 50: 1-based rank of the selected candidate in final ordering
  candidateDiversity?: 'BROAD' | 'MODERATE' | 'LIMITED' | 'NONE'; // Step 50: Candidate diversity classification (BROAD >= 4, MODERATE >= 2, LIMITED === 1, NONE = 0 / no selection)
  candidateDiversityContext?: 'SUPPORTED' | 'CONSTRAINED' | 'UNAVAILABLE'; // Step 50: Diagnostic interpretation (SUPPORTED >= 2, CONSTRAINED === 1 with selection, UNAVAILABLE = 0 / no selection)
  isBelowThresholdFallback?: boolean; // True if selected as the best available fallback below similarity threshold
  entityConsistencyModifier?: number;  // Step 53: Direct entity consistency modifier [-0.150, +0.150]
  entityMatchReason?: string;          // Step 53: Explanation of entity match or conflict
  isManuallyEdited?: boolean;     // False initially, true once user modifies timing/duration/framing
  assignedAt?: number;
}

export interface TimelineItem {
  id: string;
  mediaId: string;
  trackIndex: number;
  startTime: number;      // Position on the 16:9 timeline in seconds
  duration: number;       // Duration on the timeline in seconds
  sourceStart: number;    // Source trim in-point in seconds
  sourceDuration: number; // Native total duration of the media file (or default 5s for images)
  transform: TransformState;
  provenance?: DraftProvenance; // Lightweight portable draft metadata
}

export interface SemanticMatchCandidate {
  mediaId: string;
  mediaName: string;
  score: number; // 0.0 to 1.0 (cosine similarity)
  explanation: string;
  matchedSnippet?: string;
}

export interface SegmentMatchResult {
  segmentId: string;
  segmentText: string;
  status: 'success' | 'no_analyzed_media' | 'error';
  candidates: SemanticMatchCandidate[];
  unavailableCount: number;
  modelUsed: string;
  matchedAt: number;
  error?: string;
}

export interface AudioSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  confidence?: number;
  words?: Array<{ word: string; start: number; end: number; confidence?: number }>;
  speaker?: string;
  matchedMediaId?: string;
  matchResult?: SegmentMatchResult;
}

export interface VoiceoverTrack {
  id: string;
  name: string;
  type: 'audio';
  url: string;              // In-memory Object URL
  file?: File;              // Browser-only File instance
  duration: number;         // Total audio duration in seconds
  size?: number;            // File size in bytes
  format?: string;          // mp3, wav, m4a, aac, ogg
  waveformData?: number[];  // Extracted peak amplitudes (0 to 1) for timeline visualization
  volume: number;           // 0.0 to 1.0 (default 1.0)
  isMuted: boolean;         // Mute toggle
  segments?: AudioSegment[];// Timestamped transcript segments
  createdAt: number;
}

export interface ProjectResolution {
  width: 1920;
  height: 1080;
  aspectRatio: '16:9';
}

export interface LongFormProject {
  version: '1.0';
  id: string;
  name: string;
  description?: string;
  resolution: ProjectResolution;
  fps: number;
  timeline: TimelineItem[];
  media: MediaAsset[];
  voiceover?: VoiceoverTrack;
  createdAt: string;
  updatedAt: string;
}
