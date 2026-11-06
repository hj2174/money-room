-- ==============================================================================
-- 06. furniture_catalog 쓰기 잠금 (공개 쓰기 정책 제거 + 권한 회수)
-- 대상 테이블: public.furniture_catalog 한 개만 (기존 가계부 테이블은 건드리지 않음)
-- 이후 가구 등록/수정은 Supabase Table Editor/SQL Editor(관리자 권한)에서 수행
-- ==============================================================================

-- 1) 공개 쓰기 정책 삭제 (읽기 정책은 유지)
DROP POLICY IF EXISTS "Public Delete Furniture Catalog" ON public.furniture_catalog;
DROP POLICY IF EXISTS "Public Insert Furniture Catalog" ON public.furniture_catalog;
DROP POLICY IF EXISTS "Public Update Furniture Catalog" ON public.furniture_catalog;

-- 2) 쓰기 권한 회수, 읽기만 허용
REVOKE ALL ON public.furniture_catalog FROM anon, authenticated;
GRANT SELECT ON public.furniture_catalog TO anon, authenticated;

-- 확인 1: 정책은 SELECT 하나만 남아야 함
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'furniture_catalog';
-- 확인 2: 두 역할 모두 SELECT만 보여야 함
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
-- WHERE table_name = 'furniture_catalog' AND grantee IN ('anon', 'authenticated');