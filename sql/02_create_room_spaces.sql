-- ==============================================================================
-- 🏡 머니룸(Money Room) 02. 다중 방(room_spaces) 테이블 생성 및 스키마 확장
-- 파일 경로: sql/02_create_room_spaces.sql
-- ==============================================================================
-- ⚠️ [DROP / ALTER 대상 테이블 사전 보고]
--   1. 신규 생성 테이블:
--      - public.room_spaces (개별 방 테이블)
--   2. 컬럼 추가 (ALTER TABLE):
--      - public.room_placed_items (space_id UUID 컬럼 추가)
--   3. 제약조건 교체 (ALTER TABLE / DROP CONSTRAINT):
--      - public.room_unlocks (room_unlocks_unlock_type_check 제약조건에 'ROOM' 추가)
--   ※ 기존 가계부 테이블(transactions, budgets 등)은 절대 건드리지 않습니다.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 개별 방 메타데이터 테이블 (room_spaces) 신규 생성
--    - rooms(집)과 1:N 관계
--    - UNIQUE (room_id, space_type): 집당 같은 유형의 방은 1개만 존재
--    - tier 컬럼 제외 (크기는 space_type별로 서버가 규격 결정)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_spaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '메인룸',
    space_type TEXT NOT NULL CHECK (space_type IN ('MAIN', 'LIVING', 'BED', 'STUDY', 'KITCHEN', 'DRESS', 'BALCONY')),
    grid_cols INTEGER NOT NULL DEFAULT 8 CHECK (grid_cols BETWEEN 4 AND 20),
    grid_rows INTEGER NOT NULL DEFAULT 8 CHECK (grid_rows BETWEEN 4 AND 20),
    wallpaper_id TEXT REFERENCES public.furniture_catalog(id) ON DELETE SET NULL,
    flooring_id TEXT REFERENCES public.furniture_catalog(id) ON DELETE SET NULL,
    window_id TEXT REFERENCES public.furniture_catalog(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_room_spaces_room_type UNIQUE (room_id, space_type)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_room_spaces_room_id ON public.room_spaces(room_id);

-- ------------------------------------------------------------------------------
-- 2. room_placed_items에 방 구분 컬럼 (space_id) 추가
--    - 기존 데이터 보존을 위해 초기에는 NULL 허용으로 추가
-- ------------------------------------------------------------------------------
ALTER TABLE public.room_placed_items 
ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES public.room_spaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_room_placed_items_space_id ON public.room_placed_items(space_id);

-- ------------------------------------------------------------------------------
-- 3. room_unlocks 해금 타입에 'ROOM' 추가 (체크 제약조건 교체)
-- ------------------------------------------------------------------------------
ALTER TABLE public.room_unlocks DROP CONSTRAINT IF EXISTS room_unlocks_unlock_type_check;
ALTER TABLE public.room_unlocks 
ADD CONSTRAINT room_unlocks_unlock_type_check 
CHECK (unlock_type IN ('FURNITURE', 'TIER', 'THEME', 'ROOM'));

-- ------------------------------------------------------------------------------
-- 4. RLS(행 단위 보안) 설정
--    - room_members 기반 SELECT 전용 (FOR ALL 없음)
--    - anon 역할 권한 전면 차단
-- ------------------------------------------------------------------------------
ALTER TABLE public.room_spaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_spaces_select" ON public.room_spaces;
CREATE POLICY "room_spaces_select" ON public.room_spaces
    FOR SELECT TO authenticated
    USING (
        auth.uid() IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.room_members 
            WHERE room_members.room_id = room_spaces.room_id 
              AND room_members.user_id = auth.uid()
        )
    );

-- 권한 부여 및 차단
REVOKE ALL ON public.room_spaces FROM anon;
GRANT SELECT ON public.room_spaces TO authenticated;

-- 실시간 브로드캐스팅 등록
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.room_spaces;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 5. RPC 함수 정의
-- ------------------------------------------------------------------------------

-- 5-1. [RPC] 방 해금 및 생성 함수 (unlock_and_create_space)
--      - 한국어 오류 메시지 적용
--      - PENTHOUSE 분기 제거
--      - 방 크기(grid_cols, grid_rows)는 space_type별로 서버가 직접 결정
CREATE OR REPLACE FUNCTION public.unlock_and_create_space(
    p_room_id UUID,
    p_space_type TEXT,
    p_space_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_new_space_id UUID;
    v_final_name TEXT;
    v_cols INTEGER := 8;
    v_rows INTEGER := 8;
    v_sort_order INTEGER := 10;
BEGIN
    -- 1. 로그인 세션 검증
    IF v_actor_id IS NULL THEN 
        RAISE EXCEPTION 'UNAUTHORIZED: 로그인 세션이 필요합니다.'; 
    END IF;

    -- 2. 방 멤버십 권한 검증
    IF NOT EXISTS (
        SELECT 1 FROM public.room_members 
        WHERE room_id = p_room_id AND user_id = v_actor_id
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: 해당 집에 방을 생성할 권한이 없습니다.';
    END IF;

    -- 3. 유효한 space_type 검증
    IF p_space_type NOT IN ('LIVING', 'BED', 'STUDY', 'KITCHEN', 'DRESS', 'BALCONY') THEN
        RAISE EXCEPTION 'INVALID_SPACE_TYPE: 유효하지 않은 방 유형입니다. (요청: %)', p_space_type;
    END IF;

    -- 4. 이미 생성된 방인지 중복 검사
    IF EXISTS (
        SELECT 1 FROM public.room_spaces 
        WHERE room_id = p_room_id AND space_type = p_space_type
    ) THEN
        RAISE EXCEPTION 'ALREADY_EXISTS: 해당 유형의 방이 이미 존재합니다.';
    END IF;

    -- 5. 해금 여부 검증 (room_unlocks에 'ROOM' 타입으로 등록되어 있는지 확인)
    IF NOT EXISTS (
        SELECT 1 FROM public.room_unlocks 
        WHERE room_id = p_room_id AND unlock_type = 'ROOM' AND target_id = p_space_type
    ) THEN
        RAISE EXCEPTION 'ROOM_LOCKED: 아직 해금되지 않은 방입니다. 해금 목표를 먼저 달성해 주세요.';
    END IF;

    -- 6. space_type별 서버 규격(타일 크기 및 정렬 순서) 결정
    CASE p_space_type
        WHEN 'LIVING'  THEN v_cols := 10; v_rows := 10; v_sort_order := 1; v_final_name := '거실';
        WHEN 'BED'     THEN v_cols := 8;  v_rows := 8;  v_sort_order := 2; v_final_name := '침실';
        WHEN 'STUDY'   THEN v_cols := 8;  v_rows := 8;  v_sort_order := 3; v_final_name := '서재';
        WHEN 'KITCHEN' THEN v_cols := 8;  v_rows := 8;  v_sort_order := 4; v_final_name := '주방';
        WHEN 'DRESS'   THEN v_cols := 8;  v_rows := 8;  v_sort_order := 5; v_final_name := '드레스룸';
        WHEN 'BALCONY' THEN v_cols := 6;  v_rows := 10; v_sort_order := 6; v_final_name := '테라스/발코니';
        ELSE                v_cols := 8;  v_rows := 8;  v_sort_order := 10; v_final_name := '새로운 방';
    END CASE;

    -- 사용자 지정 이름 길이 검증 (최대 20자)
    IF p_space_name IS NOT NULL AND char_length(trim(p_space_name)) > 20 THEN
        RAISE EXCEPTION 'INVALID_NAME: 방 이름은 20자 이하여야 합니다.';
    END IF;

    -- 사용자 지정 이름이 있으면 덮어쓰기
    IF p_space_name IS NOT NULL AND trim(p_space_name) <> '' THEN
        v_final_name := trim(p_space_name);
    END IF;

    -- 7. room_spaces에 신규 방 삽입
    INSERT INTO public.room_spaces (
        room_id, name, space_type, grid_cols, grid_rows, sort_order, is_default, created_at, updated_at
    ) VALUES (
        p_room_id, v_final_name, p_space_type, v_cols, v_rows, v_sort_order, false, now(), now()
    ) RETURNING id INTO v_new_space_id;

    RETURN jsonb_build_object(
        'success', true,
        'space_id', v_new_space_id,
        'room_id', p_room_id,
        'name', v_final_name,
        'space_type', p_space_type,
        'grid_cols', v_cols,
        'grid_rows', v_rows
    );
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_and_create_space(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_and_create_space(UUID, TEXT, TEXT) TO authenticated;


-- 5-2. [RPC] 방 배경 장착 함수 (equip_space_theme)
--      - 방 멤버십 확인
--      - 슬롯('wallpaper', 'flooring', 'window')과 카탈로그 category 일치 확인
--      - 집 인벤토리 보유 필수 (quantity > 0)
--      - p_furniture_id가 NULL이면 해당 슬롯 해제
CREATE OR REPLACE FUNCTION public.equip_space_theme(
    p_space_id UUID,
    p_slot TEXT,
    p_furniture_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_room_id UUID;
    v_category TEXT;
    v_owned_qty INTEGER := 0;
BEGIN
    -- 1. 로그인 세션 검증
    IF v_actor_id IS NULL THEN 
        RAISE EXCEPTION 'UNAUTHORIZED: 로그인 세션이 필요합니다.'; 
    END IF;

    -- 2. 슬롯 유효성 검증
    IF p_slot NOT IN ('wallpaper', 'flooring', 'window') THEN
        RAISE EXCEPTION 'INVALID_SLOT: 슬롯은 wallpaper, flooring, window 중 하나여야 합니다. (요청: %)', p_slot;
    END IF;

    -- 3. 방 조회 및 소속 집(room_id) 식별
    SELECT room_id INTO v_room_id
    FROM public.room_spaces
    WHERE id = p_space_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SPACE_NOT_FOUND: 지정한 방을 찾을 수 없습니다. (ID: %)', p_space_id;
    END IF;

    -- 4. 집 멤버십 권한 검증
    IF NOT EXISTS (
        SELECT 1 FROM public.room_members 
        WHERE room_id = v_room_id AND user_id = v_actor_id
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: 해당 방의 테마를 변경할 권한이 없습니다.';
    END IF;

    -- 5. 가구 해제 (p_furniture_id가 NULL인 경우)
    IF p_furniture_id IS NULL OR trim(p_furniture_id) = '' THEN
        IF p_slot = 'wallpaper' THEN
            UPDATE public.room_spaces SET wallpaper_id = NULL, updated_at = now() WHERE id = p_space_id;
        ELSIF p_slot = 'flooring' THEN
            UPDATE public.room_spaces SET flooring_id = NULL, updated_at = now() WHERE id = p_space_id;
        ELSIF p_slot = 'window' THEN
            UPDATE public.room_spaces SET window_id = NULL, updated_at = now() WHERE id = p_space_id;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'space_id', p_space_id,
            'slot', p_slot,
            'equipped_id', NULL,
            'action', 'UNEQUIPPED'
        );
    END IF;

    -- 6. 가구 카탈로그 및 카테고리 검증
    SELECT category INTO v_category
    FROM public.furniture_catalog
    WHERE id = p_furniture_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ITEM_NOT_FOUND: 존재하지 않는 배경 아이템입니다. (ID: %)', p_furniture_id;
    END IF;

    IF v_category <> p_slot THEN
        RAISE EXCEPTION 'CATEGORY_MISMATCH: 선택한 슬롯(%)과 아이템의 카테고리(%)가 일치하지 않습니다.', p_slot, v_category;
    END IF;

    -- 7. 집 전체 인벤토리 보유 확인 (room_inventory는 집 단위 공유)
    SELECT COALESCE(quantity, 0) INTO v_owned_qty
    FROM public.room_inventory
    WHERE room_id = v_room_id AND furniture_id = p_furniture_id;

    IF v_owned_qty < 1 THEN
        RAISE EXCEPTION 'NOT_IN_INVENTORY: 집 보관함에 보유하지 않은 배경 아이템입니다. 먼저 상점에서 구매해 주세요.';
    END IF;

    -- 8. 테마 장착 UPDATE
    IF p_slot = 'wallpaper' THEN
        UPDATE public.room_spaces SET wallpaper_id = p_furniture_id, updated_at = now() WHERE id = p_space_id;
    ELSIF p_slot = 'flooring' THEN
        UPDATE public.room_spaces SET flooring_id = p_furniture_id, updated_at = now() WHERE id = p_space_id;
    ELSIF p_slot = 'window' THEN
        UPDATE public.room_spaces SET window_id = p_furniture_id, updated_at = now() WHERE id = p_space_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'space_id', p_space_id,
        'slot', p_slot,
        'equipped_id', p_furniture_id,
        'action', 'EQUIPPED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.equip_space_theme(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equip_space_theme(UUID, TEXT, TEXT) TO authenticated;


-- 5-3. [RPC] create_personal_room 보강 (신규 생성 시 기본 방 1개 자동 생성)
CREATE OR REPLACE FUNCTION public.create_personal_room(
    p_name TEXT DEFAULT '내 방'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_room_id UUID;
    v_default_space_id UUID;
    v_existing_room RECORD;
    v_room_name TEXT;
    v_init_points INTEGER;
BEGIN
    IF v_actor_id IS NULL THEN 
        RAISE EXCEPTION 'UNAUTHORIZED: 로그인 세션이 필요합니다.'; 
    END IF;

    -- 기존 개인 집 조회
    SELECT id, name, points INTO v_existing_room
    FROM public.rooms
    WHERE owner_id = v_actor_id AND room_type = 'personal'
    LIMIT 1;

    IF FOUND THEN
        -- 기본 방 ID 조회
        SELECT id INTO v_default_space_id
        FROM public.room_spaces
        WHERE room_id = v_existing_room.id AND is_default = true
        LIMIT 1;

        RETURN jsonb_build_object(
            'success', true, 
            'is_new', false, 
            'room_id', v_existing_room.id, 
            'default_space_id', v_default_space_id,
            'name', v_existing_room.name, 
            'points', v_existing_room.points
        );
    END IF;

    v_room_name := COALESCE(NULLIF(trim(p_name), ''), '내 방');

    -- 1. 집 생성
    INSERT INTO public.rooms (owner_id, name, room_type, tier, points, converted_asset_amount, created_at, updated_at)
    VALUES (v_actor_id, v_room_name, 'personal', 'studio', 0, 0, now(), now())
    RETURNING id INTO v_room_id;

    -- 2. 멤버십 등록
    INSERT INTO public.room_members (room_id, user_id, role, joined_at)
    VALUES (v_room_id, v_actor_id, 'owner', now());

    -- 3. 기본 메인 방 자동 생성 (MAIN, 8x8, is_default=true)
    INSERT INTO public.room_spaces (
        room_id, name, space_type, grid_cols, grid_rows, sort_order, is_default, created_at, updated_at
    ) VALUES (
        v_room_id, '메인룸', 'MAIN', 8, 8, 0, true, now(), now()
    ) RETURNING id INTO v_default_space_id;

    -- 4. 최초 환영 포인트 지급
    v_init_points := public.change_room_points(v_room_id, 1000, 'INITIAL_GRANT', NULL);

    RETURN jsonb_build_object(
        'success', true, 
        'is_new', true, 
        'room_id', v_room_id, 
        'default_space_id', v_default_space_id,
        'name', v_room_name, 
        'points', v_init_points
    );
END;
$$;

-- ==============================================================================
-- 🔍 [확인 쿼리 - 파일 실행 후 정상 반영 여부 점검용]
-- 아래 쿼리를 Supabase SQL Editor에서 실행하여 신규 테이블 및 컬럼이 잘 생성되었는지 확인하세요.
-- ==============================================================================
-- 1. room_spaces 테이블 및 컬럼 구조 확인
-- SELECT column_name, data_type, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'room_spaces' 
-- ORDER BY ordinal_position;

-- 2. room_placed_items에 space_id 컬럼 추가 여부 확인
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'room_placed_items' AND column_name = 'space_id';

-- 3. room_unlocks 테이블의 체크 제약조건 확인 (unlock_type에 'ROOM' 추가 반영 확인용)
SELECT conname, pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'room_unlocks' AND c.contype = 'c';
