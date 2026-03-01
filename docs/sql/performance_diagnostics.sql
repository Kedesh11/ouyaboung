-- ============================================
-- PostgreSQL / Supabase Performance Diagnostics
-- ============================================

-- 1) Slowest normalized queries (requires pg_stat_statements)
create extension if not exists pg_stat_statements;

select
  query,
  calls,
  round(mean_exec_time::numeric, 2) as mean_exec_ms,
  round(total_exec_time::numeric, 2) as total_exec_ms,
  rows
from pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
order by mean_exec_time desc
limit 50;

-- 2) Sequential scan hot spots
select
  relname as table_name,
  seq_scan,
  idx_scan,
  n_live_tup as estimated_rows
from pg_stat_user_tables
order by seq_scan desc
limit 30;

-- 3) Index usage health
select
  schemaname,
  relname as table_name,
  indexrelname as index_name,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
from pg_stat_user_indexes
order by idx_scan asc, relname asc
limit 100;

-- 4) RLS policy inventory
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  permissive,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 5) Table bloat / storage estimation
select
  relname as relation_name,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
from pg_catalog.pg_statio_user_tables
order by pg_total_relation_size(relid) desc
limit 30;
