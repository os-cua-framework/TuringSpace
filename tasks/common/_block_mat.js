import { loadImage } from '../core/assets.js';
import { splitIds } from '../core/style.js';

export const ANISO = {aerial_grass_rock:[0.031,0.095], aerial_rocks_02:[0.284,0.292], aerial_rocks_04:[0.067,0.135], anti_slip_concrete:[0.02,0.046], asphalt_01:[0.053,0.092], asphalt_02:[0.429,0.31], asphalt_05:[0.039,0.087], asphalt_06:[0.226,0.238], asphalt_07:[0.093,0.113], asphalt_floor:[0.028,0.068], asphalt_pit_lane:[0.029,0.102], asphalt_snow:[0.046,0.094], bark_brown_01:[0.44,0.43], bark_brown_02:[0.442,0.448], bark_willow:[0.464,0.472], bark_willow_02:[0.519,0.509], baseball_playground:[0.041,0.103], beam_wall_01:[0.915,0.914], beige_wall_001:[0.018,0.143], beige_wall_002:[0.026,0.147], bi_stretch:[0.184,0.195], bicolour_gravel:[0.033,0.075], bitumen:[0.811,0.794], black_painted_planks:[0.641,0.643], blue_metal_plate:[0.145,0.28], blue_painted_planks:[0.921,0.918], book_pattern:[0.208,0.212], box_profile_metal_sheet:[0.538,0.618], brick_4:[0.42,0.406], brick_floor_003:[0.172,0.182], brick_moss_001:[0.016,0.105], brick_wall_001:[0.247,0.253], brick_wall_003:[0.648,0.649], brick_wall_005:[0.319,0.323], brick_wall_006:[0.314,0.317], brick_wall_02:[0.555,0.546], brick_wall_04:[0.41,0.41], brick_wall_07:[0.285,0.288], brick_wall_08:[0.161,0.183], brick_wall_09:[0.447,0.446], brick_wall_10:[0.677,0.677], brick_wall_13:[0.567,0.572], broken_brick_wall:[0.238,0.254], broken_wall:[0.217,0.228], brown_brick_02:[0.42,0.423], brown_floor_tiles:[0.119,0.151], brown_leather:[0.157,0.177], brown_mud:[0.091,0.141], brown_mud_02:[0.077,0.14], brown_mud_03:[0.166,0.198], brown_mud_dry:[0.024,0.095], brown_mud_leaves_01:[0.043,0.091], brown_mud_rocks_01:[0.064,0.115], brown_planks_03:[0.834,0.823], brown_planks_04:[0.977,0.977], brown_planks_05:[0.956,0.957], brown_planks_07:[0.956,0.954], brown_planks_08:[0.737,0.735], brown_planks_09:[0.532,0.517], brushed_concrete:[0.042,0.108], brushed_concrete_03:[0.074,0.111], brushed_concrete_2:[0.012,0.132], burned_ground_01:[0.042,0.104], caban:[0.04,0.076], castle_brick_01:[0.633,0.629], castle_brick_02_red:[0.536,0.538], castle_brick_02_white:[0.357,0.359], castle_brick_07:[0.323,0.315], castle_brick_broken_06:[0.379,0.371], castle_wall_slates:[0.409,0.407], castle_wall_varriation:[0.252,0.268], ceramic_roof_01:[0.125,0.138], checkered_pavement_tiles:[0.012,0.062], chinese_cedar_bark:[0.358,0.368], chipped_concrete:[0.027,0.092], clay_floor_001:[0.107,0.232], clay_plaster:[0.063,0.206], clay_roof_tiles:[0.564,0.562], clay_roof_tiles_02:[0.739,0.74], clay_roof_tiles_03:[0.308,0.305], clean_asphalt:[0.212,0.236], clean_pebbles:[0.037,0.088], cliff_side:[0.296,0.331], coast_sand_03:[0.138,0.149], coast_sand_04:[0.004,0.103], coast_sand_rocks_02:[0.024,0.113], coated_pine:[0.596,0.609], cobblestone_01:[0.113,0.156], cobblestone_03:[0.015,0.088], cobblestone_04:[0.095,0.126], cobblestone_05:[0.174,0.217], cobblestone_color:[0.17,0.202], cobblestone_embedded_asphalt:[0.028,0.141], cobblestone_floor_001:[0.183,0.195], cobblestone_floor_01:[0.055,0.128], cobblestone_floor_02:[0.068,0.214], cobblestone_floor_03:[0.178,0.193], cobblestone_floor_04:[0.171,0.181], cobblestone_floor_05:[0.173,0.208], cobblestone_floor_06:[0.056,0.15], cobblestone_floor_07:[0.195,0.216], cobblestone_floor_08:[0.122,0.141], cobblestone_floor_13:[0.017,0.115], cobblestone_large_01:[0.239,0.25], cobblestone_square:[0.053,0.097], concrete:[0.638,0.62], concrete_brick_wall_001:[0.189,0.257], concrete_floor:[0.063,0.096], concrete_floor_01:[0.056,0.101], concrete_floor_02:[0.079,0.14], concrete_floor_damaged_01:[0.008,0.117], concrete_floor_painted:[0.261,0.286], concrete_floor_worn_001:[0.019,0.155], concrete_floor_worn_02:[0.046,0.094], concrete_layers:[0.286,0.336], concrete_moss:[0.121,0.175], concrete_pavement:[0.116,0.151], concrete_pavement_02:[0.022,0.16], concrete_pavement_03:[0.096,0.189], concrete_pavers_02:[0.053,0.089], concrete_pavers_03:[0.135,0.161], concrete_rock_path:[0.047,0.124], concrete_tile_facade:[0.364,0.359], concrete_tiles:[0.056,0.143], concrete_tiles_02:[0.308,0.321], concrete_wall_001:[0.865,0.801], concrete_wall_003:[0.198,0.252], concrete_wall_004:[0.779,0.777], concrete_wall_005:[0.192,0.221], concrete_wall_006:[0.119,0.169], concrete_wall_007:[0.124,0.177], concrete_wall_008:[0.118,0.199], concrete_wall_009:[0.278,0.374], container_side:[0.771,0.773], coral_fort_wall_01:[0.143,0.171], coral_fort_wall_02:[0.088,0.163], coral_fort_wall_03:[0.197,0.22], coral_gravel:[0.029,0.138], coral_ground_02:[0.067,0.124], coral_mud_01:[0.06,0.127], corrugated_iron:[0.776,0.746], corrugated_iron_02:[0.944,0.945], corrugated_iron_03:[0.343,0.348], cotton_jersey:[0.028,0.073], cracked_concrete:[0.112,0.308], cracked_concrete_02:[0.07,0.136], cracked_concrete_wall:[0.051,0.135], cracked_red_ground:[0.02,0.09], crepe_georgette:[0.12,0.137], crepe_satin:[0.075,0.113], curly_teddy_checkered:[0.072,0.357], curly_teddy_natural:[0.26,0.27], damaged_concrete_floor:[0.048,0.127], damaged_concrete_floor_02:[0.024,0.148], damaged_concrete_floor_03:[0.084,0.135], damaged_plaster:[0.173,0.207], damp_sand:[0.087,0.112], dark_brick_wall:[0.451,0.451], dark_planks:[0.97,0.968], dark_rock:[0.06,0.173], dark_wood:[0.913,0.908], dark_wooden_planks:[0.483,0.469], defense_wall:[0.03,0.096], denim_fabric:[0.456,0.342], denim_fabric_03:[0.145,0.155], denim_fabric_04:[0.103,0.124], denim_fabric_05:[0.236,0.241], denim_fabric_06:[0.185,0.193], denmin_fabric_02:[0.216,0.232], diagonal_parquet:[0.517,0.514], dirt:[0.027,0.09], dirt_floor:[0.029,0.1], dirty_carpet:[0.13,0.131], dirty_concrete:[0.136,0.207], dirty_tiles:[0.086,0.163], distressed_painted_planks:[0.625,0.678], dry_decay_leaves:[0.012,0.118], dry_ground_01:[0.08,0.101], dry_ground_rocks:[0.15,0.161], dry_mud_field_001:[0.133,0.164], dry_riverbed_rock:[0.313,0.321], embedded_rock_floor:[0.02,0.081], excavated_soil_wall:[0.22,0.256], fabric_leather_01:[0.389,0.258], fabric_leather_02:[0.154,0.204], fabric_pattern_05:[0.398,0.486], fabric_pattern_07:[0.651,0.65], factory_wall:[0.952,0.954], faux_fur_geometric:[0.489,0.493], fine_grained_wood:[0.041,0.126], floor_klinkers_04:[0.638,0.632], floor_pattern_01:[0.072,0.13], floor_pattern_02:[0.034,0.09], floor_pebbles_01:[0.055,0.087], floral_jacquard:[0.343,0.342], flower_scattered_asphalt:[0.045,0.109], forest_floor:[0.095,0.133], forest_ground_04:[0.08,0.138], forest_ground_06:[0.006,0.092], forest_leaves_02:[0.023,0.099], forest_leaves_03:[0.084,0.104], forest_leaves_04:[0.055,0.12], forrest_ground_01:[0.017,0.092], forrest_ground_03:[0.097,0.123], forrest_sand_01:[0.085,0.124], ganges_river_pebbles:[0.025,0.107], garage_floor:[0.012,0.104], gingham_check:[0.37,0.371], granular_concrete:[0.046,0.093], grass_ground:[0.046,0.115], grass_path_2:[0.025,0.093], grass_path_3:[0.071,0.116], grassy_cobblestone:[0.1,0.193], gravel_concrete:[0.036,0.087], gravel_concrete_02:[0.025,0.093], gravel_concrete_03:[0.204,0.212], gravel_concrete_04:[0.076,0.122], gravel_embedded_concrete:[0.035,0.086], gravel_floor:[0.012,0.071], gravel_floor_02:[0.078,0.105], gravel_floor_04:[0.019,0.084], gravel_ground_01:[0.094,0.148], gravel_road:[0.01,0.088], gravel_stones:[0.012,0.072], gravelly_sand:[0.029,0.097], gray_rocks:[0.049,0.13], green_metal_rust:[0.309,0.25], green_rough_planks:[0.728,0.719], grey_cartago_01:[0.028,0.172], grey_cartago_03:[0.049,0.214], grey_plaster:[0.114,0.159], grey_plaster_02:[0.131,0.155], grey_plaster_03:[0.368,0.364], grey_roof_01:[0.749,0.739], grey_roof_tiles:[0.304,0.312], grey_roof_tiles_02:[0.643,0.642], ground_grey:[0.107,0.152], hangar_concrete_floor:[0.062,0.102], herringbone_parquet:[0.01,0.101], hessian_230:[0.016,0.097], hessian_380:[0.043,0.095], hexagonal_concrete_paving:[0.038,0.058], interior_tiles:[0.054,0.211], interlocking_concrete_pavers:[0.186,0.19], japanese_cedar_planks:[0.908,0.877], japanese_hackberry_bark:[0.271,0.303], japanese_stone_wall:[0.28,0.299], japanese_sycamore:[0.054,0.133], japanese_zelkova_bark:[0.371,0.373], jersey_melange:[0.241,0.246], jogging_melange:[0.271,0.28], kitchen_wood:[0.663,0.662], knitted_fleece:[0.081,0.104], lacquered_cherry_wood:[0.477,0.453], laminate_floor:[0.583,0.571], laminate_floor_02:[0.631,0.631], laminate_floor_03:[0.668,0.668], large_red_bricks:[0.385,0.38], large_sandstone_blocks:[0.445,0.384], large_sandstone_blocks_01:[0.144,0.19], leafy_grass:[0.012,0.088], leather_white:[0.03,0.083], leaves_forest_ground:[0.032,0.089], lichen_rock:[0.18,0.204], medieval_blocks_02:[0.24,0.261], medieval_blocks_03:[0.172,0.2], medieval_blocks_05:[0.181,0.22], medieval_blocks_06:[0.21,0.23], medieval_red_brick:[0.588,0.586], medieval_wall_01:[0.221,0.248], medieval_wood:[0.836,0.832], metal_grate_rusty:[0.056,0.082], metal_plate:[0.112,0.134], metal_plate_02:[0.089,0.145], mixed_brick_wall:[0.486,0.476], monastery_stone_floor:[0.089,0.162], moss_wood:[0.465,0.439], mossy_brick:[0.43,0.432], mossy_brick_floor:[0.022,0.101], mossy_cobblestone:[0.264,0.264], mossy_rock:[0.139,0.159], mossy_sandstone:[0.159,0.184], mossy_stone_wall:[0.339,0.346], mud_cracked_dry_03:[0.107,0.15], mud_cracked_dry_riverbed_002:[0.126,0.158], mud_forest:[0.027,0.092], muddy_tracks:[0.134,0.182], oak_veneer_01:[0.635,0.618], oak_wood_planks:[0.625,0.59], old_mosaic_floor:[0.021,0.137], old_planks_02:[0.691,0.661], old_sandstone_02:[0.27,0.292], old_wood_floor:[0.574,0.568], oriented_strand_board:[0.194,0.213], painted_brick:[0.523,0.521], painted_concrete:[0.071,0.159], painted_concrete_02:[0.173,0.195], painted_metal_shutter:[0.954,0.948], painted_plaster_wall:[0.11,0.169], palm_tree_bark:[0.284,0.364], park_dirt:[0.055,0.097], park_sand:[0.138,0.154], patterned_brick_wall:[0.23,0.237], patterned_brick_wall_03:[0.111,0.162], patterned_clay_plaster:[0.302,0.322], patterned_cobblestone:[0.043,0.08], patterned_concrete_wall:[0.368,0.347], pavement_02:[0.113,0.267], pavement_05:[0.307,0.308], pebble_cemented_floor:[0.023,0.079], pebble_embedded_pavement:[0.022,0.084], pebble_ground_01:[0.064,0.093], pine_bark:[0.341,0.347], plank_flooring:[0.638,0.632], plank_flooring_02:[0.404,0.406], plank_flooring_03:[0.918,0.915], plank_flooring_04:[0.933,0.928], planks_brown_10:[0.892,0.89], plaster_brick_01:[0.224,0.235], plaster_brick_pattern:[0.292,0.289], plaster_grey_04:[0.093,0.225], plastered_stone_wall:[0.062,0.125], plastered_wall:[0.097,0.131], plastered_wall_02:[0.543,0.505], plastered_wall_03:[0.083,0.155], plastered_wall_04:[0.112,0.184], plastered_wall_05:[0.024,0.09], playground_sand:[0.046,0.126], plywood:[0.588,0.579], polar_fleece:[0.156,0.166], poly_wool_herringbone:[0.064,0.097], preconcrete_wall_001:[0.068,0.138], quatrefoil_jacquard_fabric:[0.053,0.089], rabdentse_ruins_wall:[0.293,0.3], raked_dirt:[0.036,0.108], random_bricks_thick:[0.444,0.437], raw_plank_wall:[0.732,0.718], rectangular_parquet:[0.646,0.637], red_brick:[0.421,0.403], red_brick_03:[0.602,0.594], red_brick_plaster_patch_02:[0.399,0.389], red_bricks_02:[0.343,0.362], red_bricks_04:[0.213,0.217], red_dirt_mud_01:[0.063,0.096], red_laterite_soil_stones:[0.032,0.085], red_mud_stones:[0.047,0.092], red_plaster_weathered:[0.246,0.248], red_sand:[0.046,0.101], red_sandstone_pavement:[0.371,0.417], red_sandstone_wall:[0.064,0.115], red_slate_roof_tiles_01:[0.864,0.861], reed_roof_03:[0.066,0.127], reed_roof_04:[0.168,0.256], ribbed_corduroy:[0.073,0.102], riet_01:[0.043,0.087], river_small_rocks:[0.197,0.202], rock_01:[0.092,0.111], rock_04:[0.134,0.157], rock_05:[0.006,0.133], rock_06:[0.105,0.162], rock_08:[0.153,0.181], rock_2:[0.008,0.118], rock_3:[0.051,0.113], rock_boulder_cracked:[0.075,0.148], rock_boulder_dry:[0.122,0.174], rock_face:[0.094,0.183], rock_face_03:[0.114,0.179], rock_ground:[0.227,0.233], rock_ground_02:[0.149,0.172], rock_pitted_mossy:[0.145,0.202], rock_surface:[0.091,0.146], rock_tile_floor:[0.071,0.144], rock_wall_02:[0.087,0.183], rock_wall_03:[0.261,0.273], rock_wall_04:[0.224,0.241], rock_wall_05:[0.272,0.274], rock_wall_06:[0.056,0.131], rock_wall_08:[0.242,0.242], rock_wall_09:[0.146,0.198], rock_wall_10:[0.304,0.322], rock_wall_11:[0.078,0.128], rock_wall_13:[0.123,0.172], rock_wall_15:[0.074,0.137], rock_wall_16:[0.011,0.101], rocks_ground_01:[0.165,0.177], rocks_ground_02:[0.085,0.15], rocks_ground_03:[0.052,0.119], rocks_ground_04:[0.094,0.198], rocks_ground_05:[0.062,0.182], rocks_ground_06:[0.152,0.218], rocks_ground_08:[0.169,0.185], rocks_ground_09:[0.18,0.195], rocky_gravel:[0.023,0.093], rocky_terrain_02:[0.068,0.147], rocky_trail:[0.06,0.11], rocky_trail_02:[0.017,0.089], roof_07:[0.502,0.5], roof_09:[0.155,0.174], roof_3:[0.311,0.315], roof_slates_02:[0.079,0.114], roof_slates_03:[0.527,0.531], roof_tiles:[0.468,0.468], roof_tiles_14:[0.148,0.166], rosewood_veneer1:[0.237,0.241], rough_block_wall:[0.578,0.579], rough_linen:[0.349,0.346], rough_pine_door:[0.397,0.493], rough_plaster_03:[0.267,0.282], rough_plaster_brick:[0.308,0.317], rough_plaster_brick_02:[0.469,0.484], rough_plaster_brick_04:[0.004,0.116], rough_plaster_broken:[0.062,0.194], rough_plasterbrick_05:[0.045,0.125], rough_wood:[0.623,0.627], rust_coarse_01:[0.032,0.183], rusted_shutter:[0.791,0.788], rustic_stone_wall:[0.06,0.182], rustic_stone_wall_02:[0.454,0.443], rusty_corrugated_iron:[0.785,0.777], rusty_metal:[0.871,0.871], rusty_metal_02:[0.256,0.257], rusty_metal_03:[0.134,0.218], rusty_metal_04:[0.157,0.204], rusty_metal_05:[0.176,0.259], rusty_metal_grid:[0.202,0.284], rusty_metal_sheet:[0.05,0.111], rusty_metal_shutter:[0.964,0.964], rusty_painted_metal:[0.869,0.841], sakura_bark:[0.115,0.192], sand_01:[0.137,0.161], sand_02:[0.048,0.109], sand_03:[0.036,0.131], sandstone_blocks_04:[0.171,0.203], sandstone_blocks_05:[0.414,0.426], sandstone_blocks_08:[0.369,0.371], sandstone_brick_wall_01:[0.545,0.486], sandstone_cracks:[0.296,0.301], sandy_gravel:[0.159,0.183], sandy_gravel_02:[0.089,0.135], scuba_suede:[0.045,0.097], scuffed_cement:[0.063,0.12], seaside_rock:[0.018,0.067], seaworn_sandstone_brick:[0.358,0.357], seaworn_stone_tiles:[0.331,0.337], shell_floor_01:[0.08,0.104], slab_tiles:[0.032,0.375], slate_floor_02:[0.099,0.246], smooth_concrete_floor:[0.102,0.139], snow_01:[0.328,0.372], snow_02:[0.014,0.275], snow_03:[0.035,0.11], snow_04:[0.345,0.373], snow_05:[0.086,0.251], snow_floor:[0.068,0.093], sparse_grass:[0.006,0.102], square_cobblestone:[0.135,0.179], square_concrete_pavers:[0.19,0.224], square_floor_patern_01:[0.222,0.229], square_tiles_03:[0.029,0.037], stained_pine:[0.603,0.59], stone_brick_wall_001:[0.196,0.223], stone_embedded_tiles:[0.119,0.159], stone_pathway:[0.1,0.19], stone_pathway_02:[0.087,0.167], stone_tiles_02:[0.039,0.189], stone_tiles_03:[0.018,0.06], stone_wall:[0.105,0.17], stone_wall_02:[0.043,0.126], stone_wall_04:[0.437,0.431], stony_dirt_path:[0.052,0.086], stretch_poplin:[0.23,0.237], synthetic_wood:[0.992,0.991], t_concrete_wall_002:[0.183,0.271], terlenka:[0.042,0.088], terrain_red_01:[0.026,0.086], terry_cloth:[0.071,0.105], thatch_roof_angled:[0.464,0.466], tiger_rock:[0.107,0.148], tree_bark_03:[0.303,0.319], velour_velvet:[0.035,0.095], waffle_pique_cotton:[0.248,0.247], wall_bricks_plaster:[0.272,0.283], walnut_veneer_02:[0.843,0.849], weathered_brown_planks:[0.56,0.562], weathered_planks:[0.671,0.676], white_bricks:[0.273,0.281], white_plaster_02:[0.098,0.166], white_plaster_rough_01:[0.171,0.192], white_plaster_rough_02:[0.147,0.19], white_rough_plaster:[0.009,0.118], white_sandstone_blocks_02:[0.706,0.699], white_sandstone_bricks:[0.449,0.434], white_sandstone_bricks_03:[0.773,0.77], white_stucco:[0.065,0.088], whitewashed_brick:[0.35,0.343], winter_leaves:[0.028,0.078], withered_grass:[0.015,0.095], wood_cabinet_worn_long:[0.795,0.769], wood_chip_path:[0.027,0.098], wood_chips:[0.032,0.082], wood_floor:[0.667,0.646], wood_floor_deck:[0.598,0.574], wood_floor_worn:[0.666,0.667], wood_peeling_paint_weathered:[0.498,0.51], wood_plank_wall:[0.963,0.963], wood_planks:[0.513,0.578], wood_planks_dirt:[0.59,0.593], wood_planks_grey:[0.645,0.635], wood_shutter:[0.577,0.554], wood_table:[0.656,0.648], wood_table_001:[0.616,0.629], wood_table_worn:[0.258,0.298], wood_trunk_wall:[0.679,0.653], wooden_garage_door:[0.01,0.204], wooden_gate:[0.493,0.512], wooden_panels:[0.437,0.513], wooden_planks:[0.921,0.915], wooden_rough_planks:[0.776,0.748], wool_boucle:[0.043,0.16], worn_asphalt:[0.026,0.076], worn_concrete_floor:[0.112,0.151], worn_corrugated_iron:[0.771,0.744], worn_mossy_plasterwall:[0.181,0.193], worn_planks:[0.585,0.566], worn_rock_natural_01:[0.119,0.16], worn_shutter:[0.947,0.943], worn_tile_floor:[0.005,0.17], yellow_brick:[0.398,0.395], yellow_bricks:[0.427,0.425], yellow_plaster:[0.109,0.159], yellow_plaster_02:[0.68,0.505], yellow_stone_wall:[0.302,0.304]};
export const GRIDDY = /tile|brick|block|paving|pattern|cobble|slab|parquet|herringbone|plank|check|jacquard|roof|grate|grid|corrugated|shutter|book|teddy|melange|linen|pebble|leaves|grass|lichen|moss|aerial/;
export const isoTex = (t, g = 0.2, l = 0.24) => { const a = ANISO[t.id]; return !!a && a[0] < g && a[1] < l && !GRIDDY.test(t.id); };
export const isWood = (t) => t.use === 'wood' && !/herringbone|parquet/.test(t.id);

export const KINDS = {
  wood:     { tex: (t) => isWood(t), amp: 0.32, natural: true },
  stone:    { tex: (t) => isoTex(t) && (t.use === 'stone' || (t.use === 'terrain' && /rock|boulder|sand|gravel/.test(t.id))), amp: 0.3, natural: true },
  concrete: { tex: (t) => isoTex(t) && /concrete|cement|plaster|asphalt|granular/.test(t.id), amp: 0.26, natural: true },
  metal:    { tex: (t) => t.use === 'metal' && !/grate|grid|corrugated|shutter/.test(t.id), amp: 0.22, natural: true },
  felt:     { tex: (t) => t.use === 'fabric' && isoTex(t, 0.2, 0.3), amp: 0.3, natural: false },
  leather:  { tex: (t) => /leather/.test(t.id), amp: 0.24, natural: false },
  paper:    { tex: (t) => isoTex(t, 0.12, 0.2) && /plaster|concrete|cement|granular|beige|asphalt|jersey|terlenka|velour|satin/.test(t.id), amp: 0.1, natural: false },
  plastic:  { tex: (t) => isoTex(t, 0.15, 0.25) && /plaster|granular|jersey|terlenka|leather_white|velour|satin|beige|concrete|asphalt/.test(t.id), amp: 0.05, natural: false, gloss: true },
};

const SPLITS = new Map();
export function splitList(style, pool, ids, minTest = 1) {
  const key = `${pool}|${minTest}|${ids.join(',')}`;
  if (!SPLITS.has(key)) SPLITS.set(key, splitIds(pool, ids, minTest));
  const f = SPLITS.get(key);
  return ids.filter((id) => f(id) === style.split);
}
export function pickSplit(style, pool, ids, minTest = 1) {
  const L = splitList(style, pool, ids, minTest);
  const id = L[Math.floor(style.rand() * L.length)];
  style.note(`${pool}:${id}`);
  return id;
}
export const KIND_IDS = Object.keys(KINDS);

export function kindTexPairs(style, kindsIn, extra = () => true, task = '') {
  const allowed = new Set(task ? splitList(style, `g17_kind|${task}`, kindsIn, 2) : splitList(style, 'g17_kind', KIND_IDS, 2));
  const kinds = kindsIn.filter((k) => allowed.has(k));
  const lists = kinds.map((k) => style.pool('tex', (t) => KINDS[k].tex(t) && extra(t, k)));
  const pairs = [];
  for (let r = 0; r < Math.max(0, ...lists.map((l) => l.length)); r++) kinds.forEach((k, i) => { if (r < lists[i].length) pairs.push([k, lists[i][r]]); });
  return pairs;
}
export function primaryOf(style, tag, lists) {
  const idx = style.primaryCombo(tag, lists.map((l) => Math.max(1, l.length)));
  return lists.map((l, i) => l[idx[i]] ?? null);
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const hexRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgbHex = (c) => '#' + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
export const shade = (hex, k) => rgbHex(hexRGB(hex).map((v) => v * k));
export const mix = (a, b, t) => { const p = hexRGB(a), q = hexRGB(b); return rgbHex(p.map((v, i) => v + (q[i] - v) * t)); };
export const lumOf = (hex) => { const [r, g, b] = hexRGB(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
export const rgba = (hex, a) => { const [r, g, b] = hexRGB(hex); return `rgba(${r},${g},${b},${a})`; };
const lin2s = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export const meanHex = (t) => rgbHex(t.mean_lin.map((v) => lin2s(v) * 255));
export function toneTo(hex, L, maxSat = 1) {
  let [r, g, b] = hexRGB(hex).map((v) => v / 255);
  const m = (r + g + b) / 3;
  const s = Math.max(Math.abs(r - m), Math.abs(g - m), Math.abs(b - m));
  if (s > maxSat * 0.5) { const k = (maxSat * 0.5) / s; r = m + (r - m) * k; g = m + (g - m) * k; b = m + (b - m) * k; }
  const cur = 0.2126 * r + 0.7152 * g + 0.0722 * b || 1e-3;
  const k = L / cur;
  return rgbHex([r * k * 255, g * k * 255, b * k * 255]);
}

const PIX = new Map();
function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function texPixels(file, px = 128) {
  const k = `${file}|${px}`;
  if (!PIX.has(k)) PIX.set(k, loadImage('assets/' + file).then((img) => {
    let src = img, w = img.width, h = img.height;
    while (w > px * 2 || h > px * 2) {
      const c = canvas(Math.max(px, w >> 1), Math.max(px, h >> 1)), cg = c.getContext('2d');
      cg.imageSmoothingQuality = 'high'; cg.drawImage(src, 0, 0, c.width, c.height); src = c; w = c.width; h = c.height;
    }
    const c = canvas(px), cg = c.getContext('2d', { willReadFrequently: true });
    cg.imageSmoothingQuality = 'high'; cg.drawImage(src, 0, 0, px, px);
    return cg.getImageData(0, 0, px, px).data;
  }));
  return PIX.get(k);
}
export async function detail(file, px = 128, R = 6) {
  const d = await texPixels(file, px), n = px * px, L = new Float32Array(n);
  for (let k = 0; k < n; k++) L[k] = 0.2126 * d[4 * k] + 0.7152 * d[4 * k + 1] + 0.0722 * d[4 * k + 2];
  const blur = (a) => {
    const t = new Float32Array(n), o = new Float32Array(n);
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) { let s = 0; for (let q = -R; q <= R; q++) s += a[y * px + ((x + q + px) % px)]; t[y * px + x] = s / (2 * R + 1); }
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) { let s = 0; for (let q = -R; q <= R; q++) s += t[((y + q + px) % px) * px + x]; o[y * px + x] = s / (2 * R + 1); }
    return o;
  };
  const lo = blur(blur(L));
  let ss = 0;
  for (let k = 0; k < n; k++) { L[k] -= lo[k]; ss += L[k] * L[k]; }
  const rms = Math.sqrt(ss / n) || 1;
  for (let k = 0; k < n; k++) L[k] /= rms;
  L.px = px;
  return L;
}
export function tinted(det, hex, amp) {
  const px = det.px, c = canvas(px), cg = c.getContext('2d'), im = cg.createImageData(px, px), [r, g, b] = hexRGB(hex);
  for (let k = 0; k < px * px; k++) {
    const f = 1 + amp * clamp(det[k] / 2, -1, 1);
    im.data[4 * k] = r * f; im.data[4 * k + 1] = g * f; im.data[4 * k + 2] = b * f; im.data[4 * k + 3] = 255;
  }
  cg.putImageData(im, 0, 0);
  return c;
}
export async function natural(file, { px = 128, L = null, contrast = 1, sat = 1, tint = null, tintK = 0 } = {}) {
  const d = await texPixels(file, px), n = px * px;
  let m = [0, 0, 0];
  for (let k = 0; k < n; k++) for (let i = 0; i < 3; i++) m[i] += d[4 * k + i];
  m = m.map((v) => v / n);
  const mL = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255 || 1e-3;
  const gain = L == null ? 1 : L / mL, tc = tint ? hexRGB(tint) : null;
  const c = canvas(px), cg = c.getContext('2d'), im = cg.createImageData(px, px);
  for (let k = 0; k < n; k++) {
    const v = [0, 1, 2].map((i) => m[i] + (d[4 * k + i] - m[i]) * contrast);
    const g0 = (v[0] + v[1] + v[2]) / 3;
    for (let i = 0; i < 3; i++) {
      let x = (g0 + (v[i] - g0) * sat) * gain;
      if (tc) x = x * (1 - tintK) + (tc[i] * (x / 255 / Math.max(1e-3, mL * gain))) * tintK * 0.9;
      im.data[4 * k + i] = clamp(x, 0, 255);
    }
    im.data[4 * k + 3] = 255;
  }
  cg.putImageData(im, 0, 0);
  return c;
}
const PATS = new WeakMap();
export function pat(g, cv, a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
  let m = PATS.get(g);
  if (!m) { m = new Map(); PATS.set(g, m); }
  let p = m.get(cv);
  if (!p) { p = g.createPattern(cv, 'repeat'); m.set(cv, p); }
  if (p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix([a, b, c, d, e, f]));
  return p;
}
export function facePat(g, cv, O, U, V, reps = 1) {
  const k = 1 / (cv.width / reps);
  return pat(g, cv, U.x * k, U.y * k, V.x * k, V.y * k, O.x, O.y);
}
