-- 05. 모든 방 크기를 8x8로 통일
-- 대상: public.unlock_and_create_space (함수 교체), public.room_spaces (크기 UPDATE)
-- 기존 가계부 테이블은 건드리지 않음

-- 1) 기존 방 크기를 8x8로 통일
UPDATE public.room_spaces
SET grid_cols = 8, grid_rows = 8, updated_at = now()
WHERE grid_cols <> 8 OR grid_rows <> 8;

-- 2) 방 생성 함수 교체 (모든 방 8x8, 이름 20자 제한)
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
    v_sort_order INTEGER;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: 로그인 세션이 필요합니다.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.room_members
        WHERE room_id = p_room_id AND user_id = v_actor_id
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: 해당 집에 방을 생성할 권한이 없습니다.';
    END IF;

    IF p_space_type NOT IN ('LIVING', 'BED', 'STUDY', 'KITCHEN', 'DRESS', 'BALCONY') THEN
        RAISE EXCEPTION 'INVALID_SPACE_TYPE: 유효하지 않은 방 유형입니다. (요청: %)', p_space_type;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.room_spaces
        WHERE room_id = p_room_id AND space_type = p_space_type
    ) THEN
        RAISE EXCEPTION 'ALREADY_EXISTS: 해당 유형의 방이 이미 존재합니다.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.room_unlocks
        WHERE room_id = p_room_id AND unlock_type = 'ROOM' AND target_id = p_space_type
    ) THEN
        RAISE EXCEPTION 'ROOM_LOCKED: 아직 해금되지 않은 방입니다. 해금 목표를 먼저 달성해 주세요.';
    END IF;

    CASE p_space_type
        WHEN 'LIVING'  THEN v_sort_order := 1; v_final_name := '거실';
        WHEN 'BED'     THEN v_sort_order := 2; v_final_name := '침실';
        WHEN 'STUDY'   THEN v_sort_order := 3; v_final_name := '서재';
        WHEN 'KITCHEN' THEN v_sort_order := 4; v_final_name := '주방';
        WHEN 'DRESS'   THEN v_sort_order := 5; v_final_name := '드레스룸';
        WHEN 'BALCONY' THEN v_sort_order := 6; v_final_name := '발코니';
    END CASE;

    IF p_space_name IS NOT NULL AND trim(p_space_name) <> '' THEN
        IF char_length(trim(p_space_name)) > 20 THEN
            RAISE EXCEPTION 'INVALID_NAME: 방 이름은 20자 이하여야 합니다.';
        END IF;
        v_final_name := trim(p_space_name);
    END IF;

    INSERT INTO public.room_spaces (
        room_id, name, space_type, grid_cols, grid_rows, sort_order, is_default
    ) VALUES (
        p_room_id, v_final_name, p_space_type, 8, 8, v_sort_order, false
    ) RETURNING id INTO v_new_space_id;

    RETURN jsonb_build_object(
        'success', true,
        'space_id', v_new_space_id,
        'room_id', p_room_id,
        'name', v_final_name,
        'space_type', p_space_type,
        'grid_cols', 8,
        'grid_rows', 8
    );
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_and_create_space(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_and_create_space(UUID, TEXT, TEXT) TO authenticated;

-- 확인: 모든 방이 8x8이어야 함
-- SELECT name, grid_cols, grid_rows FROM public.room_spaces;