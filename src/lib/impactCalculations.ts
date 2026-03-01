// Reusable impact calculation helpers
//
// Sources used for baseline factors:
// - FAO (2013): Food Wastage Footprint – Summary report
//   1.3 Gt edible food waste and 3.3 Gt CO2e, 250 km3 blue water
//   https://www.fao.org/docrep/018/i3347e/i3347e.pdf
// - US EPA (2025): Typical passenger vehicle emits ~400 g CO2 per mile
//   https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle
//
// Product-level weight is a platform assumption because no explicit per-item weight exists yet.

export const AVG_MEAL_WEIGHT_KG = 0.5;
export const CO2_PER_KG_FOOD_KG = 3.3 / 1.3; // ~= 2.54 kgCO2e per kg food saved
export const BLUE_WATER_PER_KG_FOOD_L = (250 * 1_000_000_000_000) / (1.3 * 1_000_000_000_000); // ~= 192.31 L/kg
export const CAR_CO2_KG_PER_KM = 0.4 / 1.609344; // 400 g/mile -> kg/km ~= 0.2485

export const CO2_PER_MEAL_KG = AVG_MEAL_WEIGHT_KG * CO2_PER_KG_FOOD_KG;
export const WATER_PER_MEAL_L = AVG_MEAL_WEIGHT_KG * BLUE_WATER_PER_KG_FOOD_L;

export const mealsToCo2Kg = (meals: number): number => meals * CO2_PER_MEAL_KG;
export const mealsToWaterL = (meals: number): number => meals * WATER_PER_MEAL_L;

// Kept as a practical approximation for UX equivalents.
export const co2KgToTrees = (co2Kg: number): number => Math.round(co2Kg / 22);
export const co2KgToCarKm = (co2Kg: number): number => Math.round(co2Kg / CAR_CO2_KG_PER_KM);
export const co2KgToShowers = (co2Kg: number): number => Math.round(co2Kg / 0.5);
export const co2KgToPhoneCharges = (co2Kg: number): number => Math.round(co2Kg / 0.008);
