-- ==============================================================================
-- 🏡 머니룸(Money Room) 03. 기존 가구 배치 데이터 무손실 이전 (Data Migration)
-- 파일 경로: sql/03_migrate_spaces_data.sql
-- ==============================================================================
-- ⚠️ [DROP / ALTER 대상 테이블 사전 보고]
--   - 본 스크립트에는 DROP 및 ALTER 문이 포함되어 있지 않습니다.
--   - 데이터 수정 대상 테이블:
--     1. public.room_spaces (기존 rooms별 기본 방 INSERT)
--     2. public.room_placed_items (기존 배치 가구의 space_id 일괄 UPDATE)
--   ※ 기존 가계부 테이블(transactions, budgets 등)은 절대 건드리지 않습니다.
-- ==============================================================================

DO $$
DECLARE
    r RECORD;
    v_default_space_id UUID;
    v_migrated_spaces_count INTEGER := 0;
    v_migrated_items_count INTEGER := 0;
BEGIN
    RAISE NOTICE '=== [머니룸 03] 기존 데이터 무손실 이전 시작 ===';

    -- 1단계: 기존의 모든 rooms 레코드에 대해 기본 방(MAIN) 1:1 생성
    -- 기존 rooms에 저장되어 있던 벽지, 바닥재, 창문을 기본 방으로 복사합니다.
    FOR r IN 
        SELECT id, name, wallpaper_id, flooring_id, window_id 
        FROM public.rooms 
    LOOP
        -- 이미 해당 방에 MAIN 기본 방이 존재하는지 확인
        SELECT id INTO v_default_space_id
        FROM public.room_spaces
        WHERE room_id = r.id AND space_type = 'MAIN';

        -- 기본 방이 없다면 신규 삽입
        IF v_default_space_id IS NULL THEN
            INSERT INTO public.room_spaces (
                room_id,
                name,
                space_type,
                grid_cols,
                grid_rows,
                wallpaper_id,
                flooring_id,
                window_id,
                sort_order,
                is_default,
                created_at,
                updated_at
            ) VALUES (
                r.id,
                '메인룸',
                'MAIN',
                8,
                8,
                r.wallpaper_id,
                r.flooring_id,
                r.window_id,
                0,
                true,
                now(),
                now()
            ) RETURNING id INTO v_default_space_id;

            v_migrated_spaces_count := v_migrated_spaces_count + 1;
        ELSE
            -- 이미 존재한다면 기존 배경 정보가 비어있을 경우에만 동기화 보정
            UPDATE public.room_spaces
            SET wallpaper_id = COALESCE(wallpaper_id, r.wallpaper_id),
                flooring_id = COALESCE(flooring_id, r.flooring_id),
                window_id = COALESCE(window_id, r.window_id),
                is_default = true,
                updated_at = now()
            WHERE id = v_default_space_id;
        END IF;

        -- 2단계: 해당 집의 가구 배치 중 space_id가 아직 NULL인 행들을 기본 방 ID로 일괄 매핑
        WITH updated_items AS (
            UPDATE public.room_placed_items
            SET space_id = v_default_space_id
            WHERE room_id = r.id AND space_id IS NULL
            RETURNING id
        )
        SELECT v_migrated_items_count + count(*) INTO v_migrated_items_count FROM updated_items;

    END LOOP;

    RAISE NOTICE '=== [머니룸 03] 데이터 이전 완료: 신규 생성된 기본 방 %개, 매핑 완료된 가구 %개 ===', 
        v_migrated_spaces_count, v_migrated_items_count;
END $$;


-- ==============================================================================
-- 🔍 [확인 쿼리 - 04번 파일 실행 전 필수 확인용]
-- 아래 쿼리들을 차례로 실행하여 데이터가 안전하게 이전되었는지 확인하세요.
-- ==============================================================================

-- 1. [가장 중요] space_id가 아직 NULL로 남아있는 배치 가구 수 조회
-- 👉 결과의 unmigrated_count가 반드시 "0"이어야 04번(NOT NULL 제약)을 안전하게 적용할 수 있습니다!
SELECT COUNT(*) AS unmigrated_count 
FROM public.room_placed_items 
WHERE space_id IS NULL;

-- 2. 생성된 기본 방 목록 및 배경 설정 확인
SELECT id AS space_id, room_id, name, space_type, grid_cols, grid_rows, wallpaper_id, flooring_id, window_id, is_default
FROM public.room_spaces
ORDER BY created_at DESC;

-- 3. 각 방별로 매핑된 배치 가구 수 현황 집계
SELECT s.id AS space_id, s.name AS space_name, s.space_type, COUNT(pi.id) AS placed_item_count
FROM public.room_spaces s
LEFT JOIN public.room_placed_items pi ON s.id = pi.space_id
GROUP BY s.id, s.name, s.space_type
ORDER BY placed_item_count DESC;
