-- Align impact factors with FAO baseline:
-- 3.3 Gt CO2e / 1.3 Gt edible food waste ~= 2.5385 kgCO2e per kg food
-- Product assumption: 0.5 kg per meal saved

create or replace function public.log_order_impact()
returns trigger as $$
declare
  v_food_per_meal numeric := 0.5;
  v_co2_per_kg_food numeric := 3.3 / 1.3;
  v_food_saved_kg numeric;
begin
  if new.status = 'completed' and (old.status is null or old.status != 'completed') then
    v_food_saved_kg := v_food_per_meal * new.quantity;

    insert into public.impact_logs (
      user_id,
      merchant_id,
      food_item_id,
      order_id,
      food_saved_kg,
      money_saved_xaf,
      co2_avoided_kg,
      revenue_xaf
    ) values (
      new.user_id,
      new.merchant_id,
      new.food_item_id,
      new.id,
      v_food_saved_kg,
      new.savings,
      round(v_food_saved_kg * v_co2_per_kg_food, 2),
      new.total_price
    );
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = '';

-- Backfill historic rows to keep dashboards and exports consistent.
update public.impact_logs
set co2_avoided_kg = round(food_saved_kg * (3.3 / 1.3), 2)
where food_saved_kg is not null;
