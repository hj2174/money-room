-- ==============================================================================
-- 🏡 머니룸(Money Room) 04. space_id NOT NULL 강제 및 다중 방 배치 검증 트리거 교체
-- 파일 경로: sql/04_enforce_space_and_triggers.sql
-- ==============================================================================
-- ⚠️ [DROP / ALTER 대상 테이블 사전 보고]
--   1. 컬럼 제약조건 변경 (ALTER TABLE):
--      - public.room_placed_items (space_id 컬럼에 NOT NULL 제약조건 추가)
--   2. 트리거 삭제 및 재생성 (DROP TRIGGER / CREATE TRIGGER):
--      - public.room_placed_items (trg_check_furniture_placement 트리거 교체)
--   ※ 기존 가계부 테이블(transactions, budgets 등)은 절대 건드리지 않습니다.
--
-- 🚨 [중요: 실행 전 주의사항]
--   이 파일은 반드시 프론트엔드 앱 코드가 가구 배치(INSERT/UPDATE) 시 'space_id'를 함께 
--   전달하도록 수정 및 배포된 후에 실행해야 합니다! (아니면 기존 앱에서 배치 실패 발생)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. room_placed_items의 space_id 컬럼에 NOT NULL 강제
--    - 모든 가구 배치는 반드시 유효한 특정 방(space_id)에 귀속되어야 함
-- ------------------------------------------------------------------------------
ALTER TABLE public.room_placed_items 
ALTER COLUMN space_id SET NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. 다중 방 지원 가구 배치 수량 검증 트리거 함수 교체
--    - space_id 유효성 및 소속 집(room_id) 일치성 검증
--    - 가구 보유량은 집 단위(room_inventory)로 조회
--    - 가구 배치량은 집 전체(모든 방 통합) 집계
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_furniture_placement_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owned_qty INTEGER := 0;
    v_total_placed_qty INTEGER := 0;
    v_space_room_id UUID;
BEGIN
    -- 1. space_id 누락 여부 검증
    IF NEW.space_id IS NULL THEN
        RAISE EXCEPTION 'MISSING_SPACE_ID: 가구를 배치할 방(space_id)이 지정되지 않았습니다.';
    END IF;

    -- 2. 지정된 방(space_id)이 현재 집(room_id)에 속해 있는지 무결성 검증
    SELECT room_id INTO v_space_room_id 
    FROM public.room_spaces 
    WHERE id = NEW.space_id;

    IF v_space_room_id IS NULL THEN
        RAISE EXCEPTION 'SPACE_NOT_FOUND: 지정된 방을 찾을 수 없습니다. (ID: %)', NEW.space_id;
    END IF;

    IF v_space_room_id <> NEW.room_id THEN
        RAISE EXCEPTION 'INVALID_SPACE: 지정된 방이 현재 집(room_id)에 속해 있지 않습니다.';
    END IF;

    -- 3. 가구 소속 집(room_id) 변경 시도 원천 차단
    IF TG_OP = 'UPDATE' AND NEW.room_id <> OLD.room_id THEN
        RAISE EXCEPTION 'CANNOT_CHANGE_ROOM_ID: 가구의 소속 집(room_id)은 변경할 수 없습니다.';
    END IF;

    -- 4. 집 전체의 가구 보유 수량 조회 (room_inventory는 집 단위 공유 창고, 동시성 제어용 행 배타 락 적용)
    SELECT COALESCE(quantity, 0) INTO v_owned_qty
    FROM public.room_inventory
    WHERE room_id = NEW.room_id AND furniture_id = NEW.furniture_id
    FOR UPDATE;

    -- 5. 집 전체(모든 방 포함)에 현재 배치된 동일 가구 개수 집계
    --    (INSERT 시 전체 카운트, UPDATE 시 본인 인스턴스는 제외하여 카운트)
    SELECT COUNT(*) INTO v_total_placed_qty
    FROM public.room_placed_items
    WHERE room_id = NEW.room_id 
      AND furniture_id = NEW.furniture_id
      AND (TG_OP = 'INSERT' OR id <> OLD.id);

    -- 6. 집 단위 잔여 수량 검증 (보유 수량 - 집 전체 배치 수량 >= 1)
    IF (v_owned_qty - v_total_placed_qty) < 1 THEN
        RAISE EXCEPTION 'INSUFFICIENT_INVENTORY: 집 전체 보관함의 잔여 수량이 부족하여 배치할 수 없습니다. (보유: %개, 집 전체 방에 배치됨: %개)', 
            v_owned_qty, v_total_placed_qty;
    END IF;

    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. 트리거 재생성
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_check_furniture_placement ON public.room_placed_items;
CREATE TRIGGER trg_check_furniture_placement
    BEFORE INSERT OR UPDATE ON public.room_placed_items
    FOR EACH ROW
    EXECUTE FUNCTION public.check_furniture_placement_limit();


-- ==============================================================================
-- 🔍 [확인 쿼리 - 04번 파일 실행 후 최종 정상 적용 확인용]
-- 아래 쿼리들을 차례로 실행하여 제약조건과 트리거가 정상 등록되었는지 확인하세요.
-- ==============================================================================

-- 1. room_placed_items.space_id의 NOT NULL 설정 여부 확인 (is_nullable이 'NO'여야 함)
SELECT table_name, column_name, is_nullable, data_type 
FROM information_schema.columns 
WHERE table_name = 'room_placed_items' AND column_name = 'space_id';

-- 2. trg_check_furniture_placement 트리거 등록 여부 확인 (1행이 조회되어야 함)
SELECT trigger_name, event_manipulation, action_statement, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'room_placed_items' 
  AND trigger_name = 'trg_check_furniture_placement';
