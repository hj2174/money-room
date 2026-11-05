// js/mineroom.js
// 🏠 머니룸 3번째 탭: 2.5D 아이소메트릭 3D 미니어처 / 클레이 렌더링 스타일 미니룸 컨트롤러

import { supabase } from './supabaseClient.js'

// ==========================================================================
// 1. 가구 아이템 카탈로그 (Supabase DB 'furniture_catalog' 및 로컬 연동)
// ==========================================================================
export const STORAGE_KEY_CATALOG = 'moneyroom_furniture_catalog'

// 동적으로 로드되는 가구 카탈로그 마스터 목록 (기존 하드코딩 코드 전면 삭제)
export let FURNITURE_CATALOG = []

// DB 행 데이터를 카탈로그 표준 객체로 변환
export function mapDbToCatalogItem(row) {
  return {
    id: String(row.id),
    name: row.name || '이름 없는 가구',
    category: row.category || 'decor-plant',
    baseW: Number(row.base_w) || 1,
    baseH: Number(row.base_h) || 1,
    price: Number(row.price) || 0,
    desc: row.description || '',
    special: Boolean(row.is_special),
    conditionType: row.condition_type || null,
    conditionValue: Number(row.condition_value) || 0,
    conditionDesc: row.condition_desc || '',
    imageUrl: row.image_url || '',
    svgData: row.svg_data || '',
    offsetX: Number(row.offset_x) || 0,
    offsetY: Number(row.offset_y) || 0,
    isFloorItem: Boolean(row.is_floor_item)
  }
}

// Supabase DB 또는 로컬 스토리지에서 가구 카탈로그 동적 로드
export async function loadFurnitureCatalog() {
  try {
    const { data, error } = await supabase
      .from('furniture_catalog')
      .select('*')
      .order('created_at', { ascending: true })

    if (!error && Array.isArray(data) && data.length > 0) {
      FURNITURE_CATALOG = data.map(mapDbToCatalogItem)
      localStorage.setItem(STORAGE_KEY_CATALOG, JSON.stringify(FURNITURE_CATALOG))
      return FURNITURE_CATALOG
    }
  } catch (err) {
    console.warn('Supabase 가구 카탈로그 조회 대기 (로컬 폴백 사용):', err.message)
  }

  // 로컬 스토리지 폴백 복원
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CATALOG)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) {
        FURNITURE_CATALOG = parsed
        return FURNITURE_CATALOG
      }
    }
  } catch (e) {
    console.warn('로컬 가구 카탈로그 로드 실패:', e)
  }

  FURNITURE_CATALOG = []
  return FURNITURE_CATALOG
}

// 가구 및 배경 리소스(이미지 / SVG / 플레이스홀더) 렌더링 헬퍼
export function renderFurnitureResource(item, options = {}) {
  if (!item) return ''
  const imgUrl = item.imageUrl || item.image_url
  const svgContent = item.svgData || item.svg_data

  if (imgUrl) {
    return `<img src="${imgUrl}" class="furniture-resource-img" alt="${item.name}" draggable="false" />`
  }
  if (svgContent) {
    return `<div class="furniture-resource-svg">${svgContent}</div>`
  }

  const isBackground = ['wallpaper', 'flooring', 'window'].includes(item.category)
  if (isBackground) {
    const icon = item.category === 'wallpaper' ? '🖼️'
               : item.category === 'flooring' ? '🪵'
               : '🪟'
    return `
      <div class="furniture-resource-placeholder">
        <span class="placeholder-icon">${icon}</span>
        <span class="placeholder-size">배경</span>
      </div>
    `
  }

  // image_url과 svg_data가 둘 다 없을 때: 점유 칸 전체를 정확히 덮는 회색 마름모 박스와 가구 이름 글자
  const spanW = Number(options.spanW ?? item.baseW ?? item.base_w) || 1
  const spanH = Number(options.spanH ?? item.baseH ?? item.base_h) || 1
  const isFloorItem = Boolean(options.isFloorItem ?? item.isFloorItem ?? item.is_floor_item)
  const slabH = (options.slabH !== undefined) ? options.slabH : (isFloorItem ? 0 : 8)

  // 점유 영역 마름모(Footprint Diamond)의 4개 꼭짓점 좌표를 그대로 사용하여 비대칭 규격(2x3, 3x2 등)도 완벽 일치
  const diamond = options.diamond
  let W, H, relTopX, relRightX, relRightY, relBottomX, relBottomY, relLeftX, relLeftY

  if (diamond) {
    W = diamond.width
    H = diamond.height
    relTopX = diamond.topX - diamond.leftX
    relRightX = diamond.rightX - diamond.leftX
    relRightY = diamond.rightY - diamond.topY
    relBottomX = diamond.bottomX - diamond.leftX
    relBottomY = diamond.bottomY - diamond.topY
    relLeftX = 0
    relLeftY = diamond.leftY - diamond.topY
  } else {
    const halfW = (options.tileW || ISO_GRID.tileW) / 2
    const halfH = (options.tileH || ISO_GRID.tileH) / 2
    W = options.width || (spanW + spanH) * halfW
    H = options.height || (spanW + spanH) * halfH
    relTopX = spanH * halfW
    relRightX = W
    relRightY = spanW * halfH
    relBottomX = spanW * halfW
    relBottomY = H
    relLeftX = 0
    relLeftY = spanH * halfH
  }

  const name = String(item.name || '가구')
  const safeName = name.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const nameLen = Math.max(1, name.length)
  const calcFontSize = Math.max(9, Math.min(13, Math.round((W * 0.8) / nameLen)))
  const gradId = `grayBoxTopGrad_${item.id || 'default'}`

  return `
    <div class="furniture-resource-placeholder-wrap">
      <svg viewBox="0 0 ${W} ${H + slabH}" width="100%" height="100%" style="display:block;overflow:visible;">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#e2e8f0"/>
            <stop offset="100%" stop-color="#cbd5e1"/>
          </linearGradient>
        </defs>
        ${slabH > 0 ? `
          <!-- 좌측 입체면 (Left -> Bottom) -->
          <polygon points="${relLeftX},${relLeftY} ${relBottomX},${relBottomY} ${relBottomX},${relBottomY + slabH} ${relLeftX},${relLeftY + slabH}" fill="#94a3b8" stroke="#64748b" stroke-width="1.2" stroke-linejoin="round"/>
          <!-- 우측 입체면 (Bottom -> Right) -->
          <polygon points="${relBottomX},${relBottomY} ${relRightX},${relRightY} ${relRightX},${relRightY + slabH} ${relBottomX},${relBottomY + slabH}" fill="#64748b" stroke="#475569" stroke-width="1.2" stroke-linejoin="round"/>
        ` : ''}
        <!-- 상단 마름모 면 (점유 영역 꼭짓점과 동일, 두께 slabH만큼 위로 상승) -->
        <polygon points="${relTopX},0 ${relRightX},${relRightY} ${relBottomX},${relBottomY} ${relLeftX},${relLeftY}" fill="url(#${gradId})" stroke="#64748b" stroke-width="1.5" stroke-linejoin="round"/>
        <!-- 가구 이름 글자 (상단 면 중심) -->
        <text x="${W / 2}" y="${H / 2}" text-anchor="middle" dominant-baseline="central" fill="#1e293b" font-size="${calcFontSize}px" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif">${safeName}</text>
      </svg>
    </div>
  `
}

// ==========================================================================
// 1-1. 다중 방 공간 종류 메타데이터 (BALCONY는 비정사각형 미검증으로 제외)
// ==========================================================================
export const SPACE_TYPES = [
  { type: 'MAIN', name: '메인룸', icon: '🏠' },
  { type: 'LIVING', name: '거실', icon: '🛋️' },
  { type: 'BED', name: '침실', icon: '🛏️' },
  { type: 'STUDY', name: '서재', icon: '📚' },
  { type: 'KITCHEN', name: '주방', icon: '🍳' },
  { type: 'DRESS', name: '드레스룸', icon: '👗' }
]

// ==========================================================================
// 1-2. 방 격자 기하학 설정 (현재 방의 grid_cols/grid_rows 기반 동적 계산)
// ==========================================================================
// 에셋 원본 타일 폭 기준 상수 (px)
export const ASSET_TILE_W = 64

export function getCurrentRoomConfig() {
  const currentSpace = (state.spaces || []).find(s => s.id === state.currentSpaceId)
  const cols = currentSpace?.grid_cols || 8
  const rows = currentSpace?.grid_rows || 8

  // 정사각형이 아닌 방은 지금은 "미지원"으로 처리
  if (cols !== rows) {
    showRoomError(`현재 방 규격(${cols}x${rows})은 미지원입니다. (정사각형 8x8 또는 10x10만 지원)`)
    return {
      cols: 8, rows: 8, tileW: 44, tileH: 22, originY: 88, slabH: 16, wallH: 70
    }
  }

  // 8x8 규격 지원
  if (cols === 8) {
    return {
      cols: 8, rows: 8, tileW: 44, tileH: 22, originY: 88, slabH: 16, wallH: 70
    }
  }

  // 10x10 규격 지원
  if (cols === 10) {
    return {
      cols: 10, rows: 10, tileW: 36.5, tileH: 18.25, originY: 82, slabH: 16, wallH: 66
    }
  }

  // 그 외 크기 미지원
  showRoomError(`현재 방 크기(${cols}x${rows})는 미지원입니다. (8x8 또는 10x10만 지원)`)
  return {
    cols: 8, rows: 8, tileW: 44, tileH: 22, originY: 88, slabH: 16, wallH: 70
  }
}

// 하위 호환
export const getGridConfig = getCurrentRoomConfig

// 2.5D 아이소메트릭 그리드 기하학 파라미터 (Proxy로 현재 방 규격 동적 연동)
export const ISO_GRID = new Proxy({}, {
  get(target, prop) {
    const config = getCurrentRoomConfig()
    return config[prop]
  }
})

// ==========================================================================
// 2. 미니룸 상태 관리 (State)
// ==========================================================================
const STORAGE_KEY_PLACED = 'moneyroom_mineroom_placed'
const STORAGE_KEY_INVENTORY = 'moneyroom_mineroom_inventory'
const STORAGE_KEY_POINTS = 'moneyroom_mineroom_points'

let state = {
  isEditing: false, // 편집 모드 여부
  totalAsset: 0, // 연동된 총자산
  roomPoints: 1000, // 보유 룸포인트
  achievedGoalsCount: 0, // 달성된 목표 개수
  goals: [], // 전체 목표 목록
  placedItems: [], // 현재 활성 방에 배치된 가구 [{ id, space_id, furniture_id, x, y, rotation, flipH }]
  housePlacedCounts: {}, // 집 전체(모든 방 통합) 가구별 배치 수량 맵 { [furniture_id]: count }
  inventory: {
    sofa_cozy: 1,
    table_tea: 1,
    plant_monstera: 1,
    rug_bear: 1,
    bed_pastel: 1
  }, // 기본 보유 아이템 수량 목록 { [furniture_id]: quantity }
  selectedItemInstanceId: null, // 현재 방에서 선택된 가구의 id
  activeShopFilter: 'bed', // 상점 카테고리 필터
  activeShopBgSubFilter: 'all', // 상점 배경 서브필터
  activeInventoryFilter: 'all', // 보관함 필터
  activePanelTab: 'inventory', // 하단 패널 탭
  isDbSynced: false, // Supabase DB 동기화 성공 여부
  isDbConnected: false, // Supabase DB 세션 및 RPC 연결 정상 여부
  isPurchasing: false, // 상점 가구 구매 RPC 처리 중 여부
  isSwitchingSpace: false, // 다중 방 전환/해금 RPC 처리 중 여부 (연타 방지)

  // 🏡 집(House / rooms) 및 방(Space / room_spaces) DB 연동 상태
  currentRoomId: null, // 집 고유 식별자 (UUID)
  currentSpaceId: null, // 현재 활성화된 방 고유 식별자 (UUID)
  spaces: [], // 현재 집의 방 메타데이터 목록 (room_spaces 레코드 배열)
  roomName: '내 방', // 집 이름
  localPoints: 0,

  // 🖼️ 현재 활성 방의 배경 테마 (wallpaper_id, flooring_id, window_id)
  roomTheme: {
    wallpaper: null,
    flooring: null,
    window: null
  }
}

// --------------------------------------------------------------------------
// 2-0. 구매 실패 에러 코드 한국어 변환 헬퍼
// --------------------------------------------------------------------------
export function formatPurchaseError(err) {
  const msg = err?.message || err?.details || String(err || '')
  if (msg.includes('INSUFFICIENT_POINTS')) {
    return '보유 룸포인트가 부족합니다.'
  }
  if (msg.includes('ALREADY_OWNED')) {
    return '이미 보유하고 있는 배경 아이템은 추가 구매할 수 없습니다.'
  }
  if (msg.includes('ITEM_NOT_FOUND')) {
    return '존재하지 않는 가구 아이템입니다.'
  }
  if (msg.includes('BACKGROUND_SINGLE_ONLY')) {
    return '배경 아이템은 한 번에 1개만 구매할 수 있습니다.'
  }
  if (msg.includes('INVALID_QUANTITY')) {
    return '구매 수량은 1개 이상이어야 합니다.'
  }
  if (msg.includes('PERMISSION_DENIED')) {
    return '해당 방의 가구를 구매할 권한이 없습니다.'
  }
  if (msg.includes('UNAUTHORIZED')) {
    return '로그인 세션이 만료되었습니다. 새로고침 후 다시 시도해주세요.'
  }
  if (msg.includes('ROOM_NOT_FOUND')) {
    return '방 정보를 찾을 수 없습니다.'
  }
  return `구매 중 오류가 발생했습니다: ${msg}`
}

// --------------------------------------------------------------------------
// 2-0-1. 가구 배치 오류 한국어 변환 헬퍼 (서버 트리거 및 DB 오류)
// --------------------------------------------------------------------------
export function formatPlacementError(err) {
  const msg = err?.message || err?.details || String(err || '')
  if (msg.includes('INSUFFICIENT_INVENTORY')) {
    return '보관함의 잔여 수량이 부족하여 가구를 배치할 수 없습니다.'
  }
  if (msg.includes('MISSING_SPACE_ID')) {
    return '가구를 배치할 방이 지정되지 않았습니다.'
  }
  if (msg.includes('INVALID_SPACE')) {
    return '지정된 방이 현재 집에 속해 있지 않습니다.'
  }
  if (msg.includes('CANNOT_CHANGE_ROOM_ID')) {
    return '다른 방으로 가구를 이동할 수 없습니다.'
  }
  if (msg.includes('duplicate key') || msg.includes('unique constraint') || msg.includes('23505')) {
    return '이미 존재하는 가구 식별자입니다. 다시 시도해주세요.'
  }
  return `가구 배치 동기화 실패: ${msg}`
}

// --------------------------------------------------------------------------
// 2-0-2. 충돌 방지 가구 고유 식별자(ID) 생성기 (room_id 포함 UUID)
// --------------------------------------------------------------------------
export function generatePlacedItemId() {
  const roomId = state.currentRoomId || 'room'
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${roomId}_${crypto.randomUUID()}`
  }
  const rand = Math.random().toString(36).substring(2, 9)
  return `${roomId}_item_${Date.now()}_${rand}`
}

// --------------------------------------------------------------------------
// 2-1. 미니룸 에러 표시 헬퍼
// --------------------------------------------------------------------------
export function showRoomError(message) {
  const banner = document.getElementById('mineroom-error-banner')
  const defaultMsg = 'DB 연결 실패: 서버와 통신할 수 없습니다.'
  const textMsg = message || defaultMsg
  if (banner) {
    const safeMsg = String(textMsg).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    banner.innerHTML = `<span class="error-icon">⚠️</span> <span class="error-text">${safeMsg}</span>`
    banner.style.display = 'flex'
  }
  showToast(textMsg, 'error')
}

// --------------------------------------------------------------------------
// 2-2. 개인 방(내 방) 불러오기 및 생성 (세션 확인 & create_personal_room RPC 연동)
// --------------------------------------------------------------------------
export async function loadPersonalRoom() {
  const banner = document.getElementById('mineroom-error-banner')
  if (banner) banner.style.display = 'none'

  try {
    // 1. 미니룸 진입 시 supabase.auth.getSession()으로 세션 확인
    let session = null
    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
      if (sessionErr) {
        console.warn('Supabase 세션 확인 알림:', sessionErr.message)
      }
      session = sessionData?.session
    } catch (sErr) {
      console.warn('세션 확인 중 오류:', sErr)
    }

    // 2. 세션이 없으면 supabase.auth.signInAnonymously() 호출
    if (!session) {
      const { data: anonData, error: anonErr } = await supabase.auth.signInAnonymously()
      if (anonErr) {
        throw new Error(`익명 로그인 실패 (${anonErr.message})`)
      }
      session = anonData?.session
    }

    if (!session) {
      throw new Error('인증 세션을 준비할 수 없습니다.')
    }

    // 3. 세션이 준비된 뒤에만 create_personal_room RPC 호출 (내 방 조회 또는 1,000P 지급 신규 생성)
    const { data, error } = await supabase.rpc('create_personal_room', { p_name: '내 방' })

    if (error) {
      throw error
    }

    if (!data || !data.room_id) {
      throw new Error('방 식별자(room_id)를 수신하지 못했습니다.')
    }

    state.currentRoomId = data.room_id
    state.roomName = data.name || '내 방'
    state.currentSpaceId = data.default_space_id || null

    // 4. DB(rooms 테이블)에서 최신 포인트 및 집 정보 조회
    const { data: roomRow, error: roomError } = await supabase
      .from('rooms')
      .select('id, name, points')
      .eq('id', data.room_id)
      .single()

    if (!roomError && roomRow) {
      state.roomPoints = Number(roomRow.points) || 0
      if (roomRow.name) state.roomName = roomRow.name
    } else {
      state.roomPoints = Number(data.points) || 0
    }

    // 5. room_spaces를 SELECT해서 state.spaces에 저장
    const { data: spacesData, error: spacesError } = await supabase
      .from('room_spaces')
      .select('*')
      .eq('room_id', state.currentRoomId)
      .order('sort_order', { ascending: true })

    if (spacesError || !spacesData || spacesData.length === 0) {
      throw new Error('방 정보를 불러오지 못했습니다.')
    }

    state.spaces = spacesData

    // default_space_id가 비어있다면 첫 번째 방 또는 is_default인 방으로 설정
    if (!state.currentSpaceId) {
      const defaultSpace = state.spaces.find(s => s.is_default) || state.spaces[0]
      state.currentSpaceId = defaultSpace ? defaultSpace.id : null
    }

    if (!state.currentSpaceId) {
      throw new Error('방 정보를 불러오지 못했습니다.')
    }

    // 현재 활성화된 방의 테마(벽지/바닥/창문)를 state.spaces의 현재 방 행에서 읽음
    const currentSpace = state.spaces.find(s => s.id === state.currentSpaceId)
    if (!currentSpace) {
      throw new Error('방 정보를 불러오지 못했습니다.')
    }

    state.roomTheme.wallpaper = currentSpace.wallpaper_id || null
    state.roomTheme.flooring = currentSpace.flooring_id || null
    state.roomTheme.window = currentSpace.window_id || null

    state.isDbConnected = true
    state.isDbSynced = true
    updateDbDisabledState()
    renderHeaderStats()
    renderSpaceTabs()
    renderShopTab()
    return true
  } catch (err) {
    console.error('내 방/공간 로드 중 오류 발생:', err)
    state.isDbConnected = false
    state.isDbSynced = false
    const msg = err.message || err.details || (typeof err === 'string' ? err : '서버와 통신할 수 없습니다.')
    const isSpaceError = msg.includes('방 정보를 불러오지 못했습니다')
    const displayMsg = isSpaceError ? '방 정보를 불러오지 못했습니다' : `DB 연결 실패: ${msg}`
    showRoomError(displayMsg)
    updateDbDisabledState()
    return false
  }
}

// --------------------------------------------------------------------------
// 2-3. DB 연결 상태에 따른 UI 제어 및 구매/배치 비활성화
// --------------------------------------------------------------------------
export function updateDbDisabledState() {
  const isOk = Boolean(state.isDbConnected)

  // 1. 방 꾸미기 토글 버튼 (#btn-header-mode)
  const btnHeader = document.getElementById('btn-header-mode')
  if (btnHeader) {
    if (!isOk) {
      btnHeader.disabled = true
      btnHeader.classList.add('btn-mode-disabled')
      btnHeader.title = 'DB 연결 실패로 방을 꾸밀 수 없습니다.'
    } else {
      btnHeader.disabled = false
      btnHeader.classList.remove('btn-mode-disabled')
      btnHeader.title = state.isEditing ? '배치 저장하기' : '방 꾸미기'
    }
  }

  // 2. 툴바 상태 문구 및 툴바 조작 버튼 비활성화
  const toolbarStatus = document.getElementById('room-toolbar-status')
  if (toolbarStatus && !isOk) {
    toolbarStatus.innerHTML = '<span class="status-warning" style="color: #ef4444; font-weight: 600;">⚠️ DB 연결 실패: 구매 및 가구 배치가 비활성화되었습니다.</span>'
  }

  const toolbarBtns = document.querySelectorAll('.room-toolbar-buttons .btn-room-action')
  toolbarBtns.forEach(btn => {
    btn.disabled = !isOk
  })

  // 3. 방 전환 칩 탭 버튼 상태 동기화
  renderSpaceTabs()
}

// --------------------------------------------------------------------------
// 2-4. 방 보관함(room_inventory) DB 동적 로드
// --------------------------------------------------------------------------
export async function loadRoomInventory() {
  if (!state.currentRoomId) return state.inventory

  try {
    const { data, error } = await supabase
      .from('room_inventory')
      .select('furniture_id, quantity')
      .eq('room_id', state.currentRoomId)

    if (error) {
      console.warn('room_inventory DB 조회 알림:', error.message)
      return state.inventory
    }

    const newInv = {}
    if (Array.isArray(data)) {
      data.forEach(row => {
        const qty = Number(row.quantity) || 0
        if (qty > 0) {
          newInv[row.furniture_id] = qty
        }
      })
    }
    state.inventory = newInv
    return state.inventory
  } catch (err) {
    console.error('room_inventory DB 로드 오류:', err)
    return state.inventory
  }
}

// --------------------------------------------------------------------------
// 2-5. 방 배치(room_placed_items) DB 동적 로드
// --------------------------------------------------------------------------
export async function loadRoomPlacements() {
  if (!state.currentRoomId) return state.placedItems

  try {
    // 1. 집 전체(room_id 기준, space_id 무관) 배치 데이터 조회
    const { data, error } = await supabase
      .from('room_placed_items')
      .select('*')
      .eq('room_id', state.currentRoomId)

    if (error) {
      throw error
    }

    if (Array.isArray(data)) {
      // 2. 집 전체 가구별 배치 수량 집계 (보관함 남은 수량 계산용)
      const counts = {}
      data.forEach(row => {
        const fid = row.furniture_id
        if (fid) {
          counts[fid] = (counts[fid] || 0) + 1
        }
      })
      state.housePlacedCounts = counts

      // 3. 화면에 그리는 가구는 현재 방(space_id) 것만 분리 필터링
      const currentRoomData = state.currentSpaceId
        ? data.filter(row => String(row.space_id) === String(state.currentSpaceId))
        : data

      state.placedItems = currentRoomData.map(row => ({
        id: String(row.id),
        space_id: row.space_id,
        furniture_id: row.furniture_id,
        x: Number(row.x) || 0,
        y: Number(row.y) || 0,
        rotation: Number(row.rotation) || 0,
        flipH: Boolean(row.flip_h || row.fliph || false)
      }))
      state.isDbSynced = true
    }
  } catch (err) {
    console.error('room_placed_items 로드 실패:', err)
    state.isDbSynced = false
    const msg = formatPlacementError(err)
    showRoomError(`배치 데이터 로드 실패: ${msg}`)
  }
  return state.placedItems
}

// ==========================================================================
// 3. 자산 및 목표 데이터 실시간 연동 (Supabase -> Point & Goal 계산)
// ==========================================================================
export async function loadFinancialData() {
  try {
    const [categoriesRes, recordsRes] = await Promise.all([
      supabase.from('budgets_and_categories').select('*').order('id', { ascending: true }),
      supabase.from('monthly_records').select('*')
    ])

    const categoryList = categoriesRes.data || []
    const recordList = recordsRes.data || []

    const targetItems = categoryList.filter(item => item.category_name !== '이번달 총 잔액')
    const goalNames = new Set(targetItems.map(item => (item.category_name || '').trim()))

    let totalIncome = 0
    let totalLivingExpense = 0

    recordList.forEach(r => {
      const amt = Number(r.amount) || 0
      if (r.type === 'income') {
        totalIncome += amt
      } else if (r.type === 'expense') {
        const memo = (r.memo || '').trim()
        const cat = (r.category || '').trim()
        const isSavings = /\[(?:목표|🎯):?([^\]]+)\]/.test(memo) || goalNames.has(cat)
        if (!isSavings) {
          totalLivingExpense += amt
        }
      }
    })

    const cumulativeNetFlow = totalIncome - totalLivingExpense
    const baseItem = categoryList.find(item => item.category_name === '이번달 총 잔액')
    const baseAsset = Number(baseItem?.current_amount) || 0
    const calculatedTotalAsset = baseAsset + cumulativeNetFlow

    state.totalAsset = Math.max(0, calculatedTotalAsset)

    let completedCount = 0
    state.goals = targetItems.map(item => {
      const current = Number(item.current_amount || 0)
      const target = Number(item.target_amount || 0)
      const isCompleted = target > 0 && current >= target
      if (isCompleted) completedCount++
      return {
        id: item.id,
        name: item.category_name,
        current,
        target,
        rate: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
        isCompleted
      }
    })
    state.achievedGoalsCount = completedCount

    // localStorage의 포인트 값은 읽어두기만 함 (향후 마이그레이션용), 쓰기 및 DB 포인트 덮어쓰기 전면 중단
    const savedPoints = localStorage.getItem(STORAGE_KEY_POINTS)
    if (savedPoints !== null) {
      state.localPoints = Number(savedPoints) || 0
    }

    renderHeaderStats()
    renderShopTab()
  } catch (err) {
    console.error('금융 데이터 연동 중 오류:', err)
  }
}

// ==========================================================================
// 4. 인벤토리 및 배치 데이터 로드 (Supabase 로드 & 로컬 폴백)
// ==========================================================================
export async function initMineroomData() {
  // 1. 가구 카탈로그 동적 로드 (Supabase DB 'furniture_catalog' 및 로컬스토리지)
  await loadFurnitureCatalog()

  // 2. 내 방(personal room) 조회 또는 생성 및 DB 포인트 동기화 (세션 확인 및 RPC 호출)
  const roomLoaded = await loadPersonalRoom()

  // ⚠️ RPC 실패 시: localStorage 값으로 조용히 폴백하지 않고, “DB 연결 실패”를 화면에 명확히 표시하고 구매/배치를 비활성화
  if (!roomLoaded) {
    state.inventory = {}
    state.placedItems = []
    renderIsoScene()
    renderPlacedItems()
    renderInventory()
    renderShopTab()
    renderHeaderStats()
    updateDbDisabledState()
    return
  }

  // 3. 보관함은 room_inventory를 DB에서 읽어서 표시
  await loadRoomInventory()

  // 4. room_placed_items 배치 데이터 DB 로드
  await loadRoomPlacements()

  updateDbSyncBadge()
  renderIsoScene()
  renderPlacedItems()
  renderInventory()
  renderSpaceTabs()
  renderShopTab()
}

function updateDbSyncBadge() {
  const badge = document.getElementById('stat-db-sync')
  if (!badge) return

  if (state.isDbSynced) {
    badge.className = 'db-sync-badge synced'
    badge.innerHTML = '☁️ DB 연동됨'
  } else {
    badge.className = 'db-sync-badge local'
    badge.innerHTML = '💾 로컬 보관'
  }
}

// ==========================================================================
// 5. 2.5D 아이소메트릭 3D 미니어처 룸 씬 렌더링 (벽체, 바닥 슬래브, 타일 & 프리뷰)
// ==========================================================================
export function getTileCoords(col, row, stageWidth) {
  const originX = stageWidth / 2
  const originY = ISO_GRID.originY
  const halfW = ISO_GRID.tileW / 2
  const halfH = ISO_GRID.tileH / 2

  const cx = originX + (col - row) * halfW
  const cy = originY + (col + row + 1) * halfH

  return {
    cx,
    cy,
    top: `${cx},${cy - halfH}`,
    right: `${cx + halfW},${cy}`,
    bottom: `${cx},${cy + halfH}`,
    left: `${cx - halfW},${cy}`
  }
}

// 다중 칸(1x1, 2x1, 1x2, 2x2 등) 가구의 사선 격자 전체 외곽 4꼭짓점 마름모 계산 (Anchor Point)
export function getFootprintDiamond(col, row, spanW, spanH, stageWidth) {
  const originX = stageWidth / 2
  const originY = ISO_GRID.originY
  const halfW = ISO_GRID.tileW / 2
  const halfH = ISO_GRID.tileH / 2

  // 1. Top 꼭짓점 (col, row의 최상단)
  const topX = originX + (col - row) * halfW
  const topY = originY + (col + row) * halfH

  // 2. Right 꼭짓점 (col + spanW, row의 최우단)
  const rightX = originX + (col + spanW - row) * halfW
  const rightY = originY + (col + spanW + row) * halfH

  // 3. Bottom 꼭짓점 (col + spanW, row + spanH의 최하단)
  const bottomX = originX + (col - row + spanW - spanH) * halfW
  const bottomY = originY + (col + row + spanW + spanH) * halfH

  // 4. Left 꼭짓점 (col, row + spanH의 최좌단)
  const leftX = originX + (col - row - spanH) * halfW
  const leftY = originY + (col + row + spanH) * halfH

  // 마름모 바닥 중심 좌표
  const centerX = (topX + bottomX) / 2
  const centerY = (topY + bottomY) / 2

  return {
    topX, topY,
    rightX, rightY,
    bottomX, bottomY,
    leftX, leftY,
    centerX, centerY,
    width: rightX - leftX,
    height: bottomY - topY,
    points: `${topX},${topY} ${rightX},${rightY} ${bottomX},${bottomY} ${leftX},${leftY}`
  }
}

/**
 * 다중 칸(1x1, 2x1, 2x3 등) 가구 배치 기준점(Anchor Point) 계산
 * - 가로(X): 점유 영역 마름모의 가로 중심(centerX) 기준 정렬
 * - 세로(Y): 점유 영역 마름모의 바닥 꼭짓점(bottomY) 기준 하단 정렬
 * - 회색 박스(플레이스홀더)와 이미지(PNG/SVG) 가구 모두 동일한 공식 적용
 */
export function getFurnitureAnchor(diamond, furnW, furnH, options = {}) {
  const offsetX = options.offsetX || 0
  const offsetY = options.offsetY || 0
  return {
    left: diamond.centerX - furnW / 2 + offsetX,
    top: diamond.bottomY - furnH + offsetY
  }
}

/**
 * 가구의 회전 상태(rotation)를 반영한 실질적 점유 타일 크기(spanW, spanH) 산출
 * - 90도 / 270도 회전 시 baseW와 baseH를 교체 (예: 2x3 -> 3x2)
 */
export function getItemSpan(item, meta) {
  const isRotated = Boolean(item && item.rotation && (item.rotation % 180 !== 0))
  const baseW = Number(meta.baseW ?? meta.base_w) || 1
  const baseH = Number(meta.baseH ?? meta.base_h) || 1
  return {
    spanW: isRotated ? baseH : baseW,
    spanH: isRotated ? baseW : baseH
  }
}

// 화면 픽셀 좌표(px, py) -> 아이소메트릭 그리드 타일 좌표(col, row) 정밀 변환
export function screenToIso(px, py, stageWidth) {
  const originX = stageWidth / 2
  const originY = ISO_GRID.originY
  const halfW = ISO_GRID.tileW / 2
  const halfH = ISO_GRID.tileH / 2

  const dx = px - originX
  const dy = py - originY

  // 2:1 아이소메트릭 사선 투영 역산
  const col = Math.floor((dy / halfH + dx / halfW) / 2)
  const row = Math.floor((dy / halfH - dx / halfW) / 2)

  if (col >= 0 && col < ISO_GRID.cols && row >= 0 && row < ISO_GRID.rows) {
    return { col, row }
  }
  return null
}

// 방 그래픽(SVG 및 가구 레이어) 캔버스 영역 요소 반환 헬퍼
export function getSceneElement() {
  return document.getElementById('mineroom-scene-area') || document.getElementById('mineroom-stage')
}

// 초록색 점선 그리드 프리뷰 폴리곤 (2x2 / 2x1 / 1x1 공간 전체를 정확히 채우는 시각적 가이드)
export function renderFootprintPreview(col, row, spanW = 1, spanH = 1, isValid = true, isDragging = false) {
  const previewLayer = document.getElementById('iso-preview-layer')
  const stage = getSceneElement()
  if (!previewLayer || !stage) return

  if (col === null || row === null) {
    previewLayer.innerHTML = ''
    return
  }

  const stageWidth = stage.clientWidth || 360
  const diamond = getFootprintDiamond(col, row, spanW, spanH, stageWidth)

  const strokeColor = isValid ? '#2d7a4d' : '#e07a5f'
  const fillColor = isValid ? 'rgba(45, 122, 77, 0.16)' : 'rgba(224, 122, 95, 0.22)'
  const strokeWidth = isDragging ? 2.2 : 1.8
  const dashArray = isDragging ? '5 3' : '4 3'

  previewLayer.innerHTML = `
    <!-- 초록색 점선 그리드 프리뷰 폴리곤 (2x2 공간 전체 피팅) -->
    <polygon 
      class="iso-footprint-preview ${isDragging ? 'is-dragging' : ''}" 
      points="${diamond.points}" 
      fill="${fillColor}" 
      stroke="${strokeColor}" 
      stroke-width="${strokeWidth}" 
      stroke-dasharray="${dashArray}"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <!-- 4개 꼭짓점 펄스 핀 포인트 -->
    <circle cx="${diamond.topX}" cy="${diamond.topY}" r="2.5" fill="${strokeColor}"/>
    <circle cx="${diamond.rightX}" cy="${diamond.rightY}" r="2.5" fill="${strokeColor}"/>
    <circle cx="${diamond.bottomX}" cy="${diamond.bottomY}" r="2.5" fill="${strokeColor}"/>
    <circle cx="${diamond.leftX}" cy="${diamond.leftY}" r="2.5" fill="${strokeColor}"/>
  `
}

// 3D 미니어처 다이오라마 룸 전체 씬(스킨 테마 반영 벽체, 창문, 3D 슬래브, 타일 & 프리뷰) 렌더링
export function renderIsoScene() {
  const svg = document.getElementById('iso-scene-svg')
  const stage = getSceneElement()
  if (!svg || !stage) return

  const stageWidth = stage.clientWidth || 360
  const stageHeight = stage.clientHeight || 335
  const originX = stageWidth / 2
  const originY = ISO_GRID.originY
  const halfW = ISO_GRID.tileW / 2
  const halfH = ISO_GRID.tileH / 2

  svg.setAttribute('viewBox', `0 0 ${stageWidth} ${stageHeight}`)

  // 바닥 4개 꼭짓점 좌표 (현재 티어 그리드 크기 자동 반영)
  const topPt = { x: originX, y: originY }
  const rightPt = { x: originX + ISO_GRID.cols * halfW, y: originY + ISO_GRID.cols * halfH }
  const bottomPt = { x: originX + (ISO_GRID.cols - ISO_GRID.rows) * halfW, y: originY + (ISO_GRID.cols + ISO_GRID.rows) * halfH }
  const leftPt = { x: originX - ISO_GRID.rows * halfW, y: originY + ISO_GRID.rows * halfH }
  const slabH = ISO_GRID.slabH || 16
  const wallH = ISO_GRID.wallH || 70
  const wallTopY = topPt.y - wallH
  const leftWallTopY = leftPt.y - wallH
  const rightWallTopY = rightPt.y - wallH

  // 장착된 커스텀 배경 리소스 데이터 로드 (카탈로그 동적 조회)
  const curWall = state.roomTheme.wallpaper ? FURNITURE_CATALOG.find(f => f.id === state.roomTheme.wallpaper) : null
  const curFloor = state.roomTheme.flooring ? FURNITURE_CATALOG.find(f => f.id === state.roomTheme.flooring) : null
  const curWin = state.roomTheme.window ? FURNITURE_CATALOG.find(f => f.id === state.roomTheme.window) : null

  // 벽지 스타일 색상 및 리소스 설정 (기본: 모던 내추럴 웜그레이)
  const wallLeft1 = '#f2eee7'
  const wallLeft2 = '#dfd9cd'
  const wallRight1 = '#ded8cc'
  const wallRight2 = '#cac1b3'
  const baseboardLeft = '#947861'
  const baseboardRight = '#7c624d'

  // 바닥재 스타일 색상 및 리소스 설정 (기본: 내추럴 오크 마루)
  const floorEvenColor = '#f2eae1'
  const floorOddColor = '#e8ded3'
  const floorEvenBorder = '#dfd3c5'
  const floorOddBorder = '#d6c8b7'
  const slabLeft1 = '#d6c8b7'
  const slabLeft2 = '#bda995'
  const slabRight1 = '#bda995'
  const slabRight2 = '#9e8975'

  // 좌측 벽면 원근감 투시 창문 꼭짓점 계산 (벽체 높이 wallH 비례 정밀 배치)
  const wallDx = topPt.x - leftPt.x
  const wallDy = topPt.y - leftPt.y
  const winP1 = { x: leftPt.x + wallDx * 0.32, y: (leftPt.y + wallDy * 0.32) - wallH * 0.22 }
  const winP2 = { x: leftPt.x + wallDx * 0.68, y: (leftPt.y + wallDy * 0.68) - wallH * 0.22 }
  const winP3 = { x: leftPt.x + wallDx * 0.68, y: (leftPt.y + wallDy * 0.68) - wallH * 0.72 }
  const winP4 = { x: leftPt.x + wallDx * 0.32, y: (leftPt.y + wallDy * 0.32) - wallH * 0.72 }
  const winPoints = `${winP1.x},${winP1.y} ${winP2.x},${winP2.y} ${winP3.x},${winP3.y} ${winP4.x},${winP4.y}`

  let windowSvg = ''
  if (curWin && curWin.imageUrl) {
    windowSvg = `
      <polygon points="${winP1.x},${winP1.y} ${winP2.x},${winP2.y} ${winP2.x + 35},${winP2.y + 30} ${winP1.x + 25},${winP1.y + 35}" fill="#fff7d6" fill-opacity="0.18"/>
      <image href="${curWin.imageUrl}" x="${winP4.x}" y="${winP4.y}" width="${winP2.x - winP4.x}" height="${winP1.y - winP4.y}" preserveAspectRatio="none"/>
    `
  } else if (curWin && curWin.svgData) {
    windowSvg = `
      <polygon points="${winP1.x},${winP1.y} ${winP2.x},${winP2.y} ${winP2.x + 35},${winP2.y + 30} ${winP1.x + 25},${winP1.y + 35}" fill="#fff7d6" fill-opacity="0.18"/>
      <g transform="translate(${winP4.x}, ${winP4.y})">${curWin.svgData}</g>
    `
  } else {
    // 기본 선샤인 미니멀 창문 렌더링
    windowSvg = `
      <!-- 창문 햇살 바닥 투영 그림자 -->
      <polygon points="${winP1.x},${winP1.y} ${winP2.x},${winP2.y} ${winP2.x + 40},${winP2.y + 35} ${winP1.x + 30},${winP1.y + 40}" fill="#fff7d6" fill-opacity="0.16"/>
      <!-- 창문 프레임 및 유리 -->
      <polygon points="${winPoints}" fill="#e8f3fa" stroke="#36322d" stroke-width="2"/>
      <polygon points="${winPoints}" fill="url(#windowGlassGrad)"/>
      <line x1="${(winP1.x + winP2.x)/2}" y1="${(winP1.y + winP2.y)/2}" x2="${(winP4.x + winP3.x)/2}" y2="${(winP4.y + winP3.y)/2}" stroke="#36322d" stroke-width="1.2"/>
      <line x1="${(winP1.x + winP4.x)/2}" y1="${(winP1.y + winP4.y)/2}" x2="${(winP2.x + winP3.x)/2}" y2="${(winP2.y + winP3.y)/2}" stroke="#36322d" stroke-width="1.2"/>
    `
  }

  let svgContent = `
    <defs>
      <!-- 좌측 벽면 그라데이션 (스킨 테마 연동) -->
      <linearGradient id="clayWallLeft" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${wallLeft1}"/>
        <stop offset="100%" stop-color="${wallLeft2}"/>
      </linearGradient>
      <!-- 우측 벽면 음영 그라데이션 (스킨 테마 연동) -->
      <linearGradient id="clayWallRight" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${wallRight1}"/>
        <stop offset="100%" stop-color="${wallRight2}"/>
      </linearGradient>
      <!-- 3D 슬래브 좌하단면 (스킨 테마 연동) -->
      <linearGradient id="slabLeftGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${slabLeft1}"/>
        <stop offset="100%" stop-color="${slabLeft2}"/>
      </linearGradient>
      <!-- 3D 슬래브 우하단면 (스킨 테마 연동) -->
      <linearGradient id="slabRightGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${slabRight1}"/>
        <stop offset="100%" stop-color="${slabRight2}"/>
      </linearGradient>
      <!-- 창문 유리 반사광 그라데이션 -->
      <linearGradient id="windowGlassGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.6"/>
        <stop offset="40%" stop-color="#ffffff" stop-opacity="0.1"/>
        <stop offset="100%" stop-color="#cbe5f7" stop-opacity="0.3"/>
      </linearGradient>
      <!-- 슬래브 하단 3D 앰비언트 그림자 -->
      <filter id="softFloorShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
        <feOffset dx="0" dy="8"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.14"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <!-- 1. 다이오라마 룸 하단 앰비언트 섀도우 -->
    <polygon points="${leftPt.x},${leftPt.y + slabH + 4} ${bottomPt.x},${bottomPt.y + slabH + 10} ${rightPt.x},${rightPt.y + slabH + 4} ${topPt.x},${topPt.y + slabH + 4}" fill="#201a15" fill-opacity="0.15" filter="url(#softFloorShadow)"/>

    <!-- 2. 좌측 벽면 -->
    <polygon points="${leftPt.x},${leftPt.y} ${topPt.x},${topPt.y} ${topPt.x},${wallTopY} ${leftPt.x},${leftWallTopY}" fill="url(#clayWallLeft)"/>
    <!-- 좌측 벽면 걸레받이 (Baseboard) -->
    <polygon points="${leftPt.x},${leftPt.y} ${topPt.x},${topPt.y} ${topPt.x},${topPt.y - 6} ${leftPt.x},${leftPt.y - 6}" fill="${baseboardLeft}"/>

    <!-- 🪟 좌측 벽면 창문 스킨 렌더링 -->
    ${windowSvg}

    <!-- 3. 우측 벽면 -->
    <polygon points="${topPt.x},${topPt.y} ${rightPt.x},${rightPt.y} ${rightPt.x},${rightWallTopY} ${topPt.x},${wallTopY}" fill="url(#clayWallRight)"/>
    <!-- 우측 벽면 걸레받이 (Baseboard) -->
    <polygon points="${topPt.x},${topPt.y} ${rightPt.x},${rightPt.y} ${rightPt.x},${rightPt.y - 6} ${topPt.x},${topPt.y - 6}" fill="${baseboardRight}"/>

    <!-- 중앙 코너 앰비언트 음영 라인 -->
    <line x1="${topPt.x}" y1="${wallTopY}" x2="${topPt.x}" y2="${topPt.y}" stroke="#201a15" stroke-opacity="0.12" stroke-width="1.5"/>

    <!-- 4. 3D 바닥 슬래브 두께면 -->
    <polygon points="${leftPt.x},${leftPt.y} ${bottomPt.x},${bottomPt.y} ${bottomPt.x},${bottomPt.y + slabH} ${leftPt.x},${leftPt.y + slabH}" fill="url(#slabLeftGrad)"/>
    <polygon points="${bottomPt.x},${bottomPt.y} ${rightPt.x},${rightPt.y} ${rightPt.x},${rightPt.y + slabH} ${bottomPt.x},${bottomPt.y + slabH}" fill="url(#slabRightGrad)"/>

    <!-- 5. 아이소메트릭 마름모 바닥 타일들 -->
    <g id="iso-tiles-group">
  `

  for (let r = 0; r < ISO_GRID.rows; r++) {
    for (let c = 0; c < ISO_GRID.cols; c++) {
      const coords = getTileCoords(c, r, stageWidth)
      const points = `${coords.top} ${coords.right} ${coords.bottom} ${coords.left}`
      const isEven = (r + c) % 2 === 0
      const tileFill = isEven ? floorEvenColor : floorOddColor
      const tileStroke = isEven ? floorEvenBorder : floorOddBorder

      svgContent += `
        <polygon 
          class="iso-tile-poly ${isEven ? 'checker-even' : 'checker-odd'}" 
          points="${points}" 
          data-col="${c}" 
          data-row="${r}"
          style="fill: ${tileFill}; stroke: ${tileStroke};">
        </polygon>
      `
    }
  }

  svgContent += `
    </g>
    <!-- 6. 초록색 점선 그리드 프리뷰 전용 레이어 (가구 풋프린트) -->
    <g id="iso-preview-layer"></g>
  `

  svg.innerHTML = svgContent

  // 타일 클릭 이벤트 바인딩
  svg.querySelectorAll('.iso-tile-poly').forEach(poly => {
    poly.addEventListener('click', () => {
      if (!state.isEditing) return
      selectItem(null)
    })
  })
}

// ==========================================================================
// 6. 아이소메트릭 가구 배치 렌더링 및 인터랙션 (깊이 정렬 & 드래그)
// ==========================================================================
// 가구 이미지 원본 크기 비동기 캐시 (scale 계산용)
const assetImageSizeCache = new Map()

function renderPlacedItems() {
  const layer = document.getElementById('placed-layer')
  const stage = getSceneElement()
  if (!layer || !stage) return

  const stageWidth = stage.clientWidth || 360
  layer.innerHTML = ''

  let selectedItemFootprint = null

  state.placedItems.forEach(item => {
    const meta = FURNITURE_CATALOG.find(f => f.id === item.furniture_id)
    if (!meta) return

    // 가구 회전(rotation) 반영한 실질 점유 타일(spanW, spanH) 산출
    const { spanW, spanH } = getItemSpan(item, meta)

    // 가구가 차지하는 전체 사선 격자 마름모(Footprint Diamond) 정밀 산출
    const diamond = getFootprintDiamond(item.x, item.y, spanW, spanH, stageWidth)

    // 바닥 아이템(러그 등) 판별: furniture_catalog의 is_floor_item 컬럼으로 판별
    const isFloorItem = Boolean(meta.isFloorItem ?? meta.is_floor_item)

    // 가구 에셋 원본 타일 폭(ASSET_TILE_W) 기준 스케일 및 크기 계산
    const scale = ISO_GRID.tileW / ASSET_TILE_W

    let assetW = 0
    let assetH = 0

    const svgStr = meta.svgData || meta.svg_data
    const imgUrl = meta.imageUrl || meta.image_url

    if (svgStr) {
      // SVG viewBox 또는 width/height 기반 원본 에셋 규격 파싱
      const vbMatch = svgStr.match(/viewBox=["']\s*([-\d.]+)\s+([-\d.]+)\s+([\d.]+)\s+([\d.]+)/)
      if (vbMatch) {
        assetW = parseFloat(vbMatch[3])
        assetH = parseFloat(vbMatch[4])
      } else {
        const wMatch = svgStr.match(/width=["']([\d.]+)p?x?["']/)
        const hMatch = svgStr.match(/height=["']([\d.]+)p?x?["']/)
        if (wMatch && hMatch) {
          assetW = parseFloat(wMatch[1])
          assetH = parseFloat(hMatch[1])
        }
      }
    } else if (imgUrl) {
      if (assetImageSizeCache.has(imgUrl)) {
        const cached = assetImageSizeCache.get(imgUrl)
        assetW = cached.width
        assetH = cached.height
      } else {
        const preImg = new Image()
        preImg.onload = () => {
          assetImageSizeCache.set(imgUrl, { width: preImg.naturalWidth, height: preImg.naturalHeight })
          renderPlacedItems()
        }
        preImg.src = imgUrl
      }
    }

    const hasResource = Boolean(svgStr || imgUrl)

    let furnW, furnH, slabH = 0
    if (hasResource) {
      // 원본 크기를 알 수 없는 경우 점유 칸(Footprint) 기준 기본 규격 적용
      if (!assetW || !assetH) {
        const footprintW = (spanW + spanH) * (ASSET_TILE_W / 2)
        assetW = footprintW
        assetH = isFloorItem ? (spanW + spanH) * (ASSET_TILE_W / 4) : footprintW * 0.85
      }
      furnW = assetW * scale
      furnH = assetH * scale
    } else {
      // image_url과 svg_data가 둘 다 없을 때: 점유 칸 전체를 정확히 덮는 회색 마름모 박스
      slabH = isFloorItem ? 0 : 8
      furnW = diamond.width
      furnH = diamond.height + slabH
    }

    // 90도/270도 회전 시 아이소메트릭 축(X축 <-> Y축) 전환에 따라 스프라이트 기본 방향 반전 반영
    const isRotated90 = (item.rotation === 90 || item.rotation === 270)
    const shouldFlip = Boolean(item.flipH) !== Boolean(isRotated90)

    // 이미지 위치 보정값 (offset_x, offset_y)을 스케일에 비례하여 적용
    const rawOffsetX = Number(meta.offsetX ?? meta.offset_x) || 0
    const rawOffsetY = Number(meta.offsetY ?? meta.offset_y) || 0
    const scaledOffsetX = rawOffsetX * scale
    const scaledOffsetY = rawOffsetY * scale
    const finalOffsetX = shouldFlip ? -scaledOffsetX : scaledOffsetX

    // 점유 영역 마름모의 가로 중심(centerX) 및 바닥 꼭짓점(bottomY) 기준 단일 앵커 좌표 도출
    const anchor = getFurnitureAnchor(diamond, furnW, furnH, {
      offsetX: finalOffsetX,
      offsetY: scaledOffsetY
    })

    const isSelected = state.selectedItemInstanceId === item.id
    if (isSelected) {
      selectedItemFootprint = { col: item.x, row: item.y, spanW, spanH }
    }

    const el = document.createElement('div')
    el.className = `iso-furniture-item ${isSelected ? 'is-selected' : ''}`
    el.dataset.instanceId = item.id

    el.style.width = `${furnW}px`
    el.style.height = `${furnH}px`
    // 점유 영역 마름모의 가로 중심(centerX) 및 바닥 꼭짓점(bottomY) 기준 위치 배치
    el.style.left = `${anchor.left}px`
    el.style.top = `${anchor.top}px`

    // 깊이 정렬 (앞쪽 가구가 뒤쪽 가구를 가리는 2.5D Z-Index)
    const zIndex = isFloorItem 
      ? Math.round((item.y + spanH) * 2 + (item.x + spanW))
      : 100 + Math.round((item.y + spanH) * 20 + (item.x + spanW))
    el.style.zIndex = zIndex

    // 텍스트 미러링 방지: 플레이스홀더 텍스트는 좌우 반전시키지 않음
    const flipH = (hasResource && shouldFlip) ? -1 : 1
    const transformStyle = flipH === -1 ? 'scaleX(-1)' : ''

    el.innerHTML = `
      <div class="furniture-inner-wrap" style="${transformStyle ? `transform: ${transformStyle};` : ''}">
        ${renderFurnitureResource(meta, {
          diamond,
          spanW,
          spanH,
          width: diamond.width,
          height: diamond.height,
          isFloorItem,
          slabH
        })}
      </div>
    `

    if (isSelected && state.isEditing) {
      const bubble = document.createElement('div')
      bubble.className = 'furniture-action-bubble'
      bubble.innerHTML = `
        <button type="button" class="btn-action-bubble bubble-rotate" title="90° 회전">🔄 회전</button>
        <button type="button" class="btn-action-bubble bubble-flip" title="좌우 반전">↔️ 반전</button>
        <button type="button" class="btn-action-bubble bubble-remove" title="보관함으로">📦 보관</button>
        <button type="button" class="btn-action-bubble" title="선택 해제">✕</button>
      `
      bubble.querySelector('.bubble-rotate').addEventListener('click', (e) => {
        e.stopPropagation()
        rotateSelectedItem()
      })
      bubble.querySelector('.bubble-flip').addEventListener('click', (e) => {
        e.stopPropagation()
        flipSelectedItem()
      })
      bubble.querySelector('.bubble-remove').addEventListener('click', (e) => {
        e.stopPropagation()
        removeSelectedItemToInventory()
      })
      bubble.querySelector('button:last-child').addEventListener('click', (e) => {
        e.stopPropagation()
        selectItem(null)
      })
      el.appendChild(bubble)
    }

    attachIsoDrag(el, item, meta)
    layer.appendChild(el)
  })

  // 선택된 가구가 있으면 바닥에 초록색 점선 그리드 프리뷰 표시
  if (selectedItemFootprint && state.isEditing) {
    renderFootprintPreview(selectedItemFootprint.col, selectedItemFootprint.row, selectedItemFootprint.spanW, selectedItemFootprint.spanH, true, false)
  } else {
    renderFootprintPreview(null, null)
  }

  updateToolbarSelectionStatus()
}

function updateToolbarSelectionStatus() {
  const toolbar = document.querySelector('.room-toolbar')
  const statusEl = document.getElementById('room-toolbar-status')
  const rotateBtn = document.getElementById('btn-toolbar-rotate')
  const flipBtn = document.getElementById('btn-toolbar-flip')
  const removeBtn = document.getElementById('btn-toolbar-remove')

  if (toolbar) {
    toolbar.classList.toggle('is-editing', state.isEditing)
  }

  if (!state.isEditing) {
    if (statusEl) statusEl.innerHTML = ''
    if (rotateBtn) rotateBtn.disabled = true
    if (flipBtn) flipBtn.disabled = true
    if (removeBtn) removeBtn.disabled = true
    return
  }

  if (state.selectedItemInstanceId) {
    const item = state.placedItems.find(i => i.id === state.selectedItemInstanceId)
    const meta = item ? FURNITURE_CATALOG.find(f => f.id === item.furniture_id) : null
    const rotText = item && item.rotation ? ` (${item.rotation}°)` : ''
    const flipText = item && item.flipH ? ' (↔️ 반전됨)' : ''
    if (statusEl) {
      statusEl.innerHTML = `✨ <strong>[${meta ? meta.name : '가구'}]</strong>${rotText}${flipText}`
    }
    if (rotateBtn) rotateBtn.disabled = false
    if (flipBtn) flipBtn.disabled = false
    if (removeBtn) removeBtn.disabled = false
  } else {
    if (statusEl) {
      statusEl.innerHTML = '🖐️ 가구를 터치하거나 드래그해 배치하세요'
    }
    if (rotateBtn) rotateBtn.disabled = true
    if (flipBtn) flipBtn.disabled = true
    if (removeBtn) removeBtn.disabled = true
  }
}

// 아이소메트릭 가구 드래그 핸들러 (Anchor Point & Drag Offset 정밀 보정)
let isoDragCtx = null

function attachIsoDrag(el, item, meta) {
  let isDown = false
  let startX = 0
  let startY = 0
  let isMoved = false

  el.addEventListener('pointerdown', (e) => {
    if (!state.isEditing) {
      showToast(`이 가구는 [${meta.name}]입니다 ✨`)
      return
    }

    if (e.target.closest('.furniture-action-bubble')) return

    isDown = true
    startX = e.clientX
    startY = e.clientY
    isMoved = false

    const { spanW, spanH } = getItemSpan(item, meta)

    const stage = getSceneElement()
    const rect = stage ? stage.getBoundingClientRect() : { left: 0, top: 0 }
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const clickedTile = screenToIso(px, py, stage ? stage.clientWidth : 360)

    // 마우스/터치 클릭 위치와 가구 좌상단(item.x, item.y) 간의 상대 타일 오프셋(Anchor Point) 계산
    let offsetCol = 0
    let offsetRow = 0
    if (clickedTile) {
      offsetCol = clickedTile.col - item.x
      offsetRow = clickedTile.row - item.y
      if (offsetCol < 0 || offsetCol >= spanW || offsetRow < 0 || offsetRow >= spanH) {
        offsetCol = Math.floor(spanW / 2)
        offsetRow = Math.floor(spanH / 2)
      }
    } else {
      offsetCol = Math.floor(spanW / 2)
      offsetRow = Math.floor(spanH / 2)
    }

    isoDragCtx = {
      instanceId: item.id,
      item,
      meta,
      element: el,
      offsetCol,
      offsetRow,
      spanW,
      spanH
    }

    el.setPointerCapture(e.pointerId)
  })

  el.addEventListener('pointermove', (e) => {
    if (!isDown || !isoDragCtx) return

    const dx = e.clientX - startX
    const dy = e.clientY - startY

    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      isMoved = true
      el.classList.add('is-dragging')

      const stage = getSceneElement()
      if (stage) {
        const rect = stage.getBoundingClientRect()
        const px = e.clientX - rect.left
        const py = e.clientY - rect.top
        const tile = screenToIso(px, py, stage.clientWidth)

        if (tile) {
          // 마우스 클릭 시점의 상대 오프셋을 역산하여 가구의 실제 좌상단 배치 좌표 도출
          const targetCol = tile.col - isoDragCtx.offsetCol
          const targetRow = tile.row - isoDragCtx.offsetRow
          const clampedCol = Math.max(0, Math.min(ISO_GRID.cols - isoDragCtx.spanW, targetCol))
          const clampedRow = Math.max(0, Math.min(ISO_GRID.rows - isoDragCtx.spanH, targetRow))

          const isValid = targetCol >= 0 && (targetCol + isoDragCtx.spanW) <= ISO_GRID.cols &&
                          targetRow >= 0 && (targetRow + isoDragCtx.spanH) <= ISO_GRID.rows

          highlightCandidate(clampedCol, clampedRow, isoDragCtx.meta, isoDragCtx.spanW, isoDragCtx.spanH)
          renderFootprintPreview(clampedCol, clampedRow, isoDragCtx.spanW, isoDragCtx.spanH, isValid, true)
        } else {
          clearHighlights()
          renderFootprintPreview(null, null)
        }
      }
    }
  })

  el.addEventListener('pointerup', (e) => {
    if (!isDown) return
    isDown = false
    el.classList.remove('is-dragging')
    clearHighlights()

    if (!isMoved) {
      if (state.selectedItemInstanceId === item.id) {
        selectItem(null)
      } else {
        selectItem(item.id)
      }
    } else {
      const stage = getSceneElement()
      if (stage && isoDragCtx) {
        const rect = stage.getBoundingClientRect()
        const px = e.clientX - rect.left
        const py = e.clientY - rect.top
        const tile = screenToIso(px, py, stage.clientWidth)

        if (tile) {
          const targetCol = tile.col - isoDragCtx.offsetCol
          const targetRow = tile.row - isoDragCtx.offsetRow
          applyDropItem(isoDragCtx.instanceId, targetCol, targetRow)
        }
      }
    }

    isoDragCtx = null
  })
}

function highlightCandidate(col, row, meta, customSpanW, customSpanH) {
  clearHighlights()
  if (!meta) return
  const spanW = customSpanW || meta.baseW
  const spanH = customSpanH || meta.baseH

  const isValid = col >= 0 && (col + spanW) <= ISO_GRID.cols && row >= 0 && (row + spanH) <= ISO_GRID.rows

  for (let r = row; r < row + spanH; r++) {
    for (let c = col; c < col + spanW; c++) {
      if (r >= 0 && r < ISO_GRID.rows && c >= 0 && c < ISO_GRID.cols) {
        const poly = document.querySelector(`.iso-tile-poly[data-col="${c}"][data-row="${r}"]`)
        if (poly) {
          poly.classList.add(isValid ? 'tile-highlight-valid' : 'tile-highlight-invalid')
        }
      }
    }
  }
}

function clearHighlights() {
  document.querySelectorAll('.iso-tile-poly').forEach(p => {
    p.classList.remove('tile-highlight-valid', 'tile-highlight-invalid')
  })
}

async function applyDropItem(instanceId, col, row) {
  const itemIndex = state.placedItems.findIndex(i => i.id === instanceId)
  if (itemIndex === -1) return

  const item = state.placedItems[itemIndex]
  const meta = FURNITURE_CATALOG.find(f => f.id === item.furniture_id)
  if (!meta) return

  const { spanW, spanH } = getItemSpan(item, meta)

  const clampedX = Math.max(0, Math.min(ISO_GRID.cols - spanW, col))
  const clampedY = Math.max(0, Math.min(ISO_GRID.rows - spanH, row))

  // 위치 변화가 없는 경우 불필요한 DB UPDATE 생략
  if (item.x === clampedX && item.y === clampedY) {
    selectItem(instanceId)
    return
  }

  // 이전 위치 백업 (실패 시 롤백용)
  const prevX = item.x
  const prevY = item.y

  // 화면 선반영
  item.x = clampedX
  item.y = clampedY
  selectItem(instanceId)
  renderPlacedItems()

  if (!state.isDbConnected || !state.currentRoomId) {
    showRoomError('DB 연결이 되어있지 않아 가구 이동 위치가 저장되지 않습니다.')
    return
  }

  try {
    // 단건 UPDATE: room_placed_items (x, y)
    const { error } = await supabase
      .from('room_placed_items')
      .update({
        x: clampedX,
        y: clampedY,
        updated_at: new Date().toISOString()
      })
      .eq('id', instanceId)
      .eq('room_id', state.currentRoomId)
      .eq('space_id', state.currentSpaceId)

    if (error) {
      throw error
    }

    try {
      localStorage.setItem(STORAGE_KEY_PLACED, JSON.stringify(state.placedItems))
    } catch (e) {}
    showToast(`가구가 (${clampedX + 1}, ${clampedY + 1}) 위치로 이동되었습니다 ✨`)
  } catch (err) {
    console.error('가구 이동(UPDATE) 실패:', err)
    // 롤백: 이전 위치로 복원
    item.x = prevX
    item.y = prevY
    renderPlacedItems()
    const msg = formatPlacementError(err)
    showToast(msg, 'error')
    showRoomError(msg)
  }
}

export function selectItem(instanceId) {
  state.selectedItemInstanceId = instanceId
  renderPlacedItems()
}

export async function rotateSelectedItem() {
  if (!state.isDbConnected || !state.currentRoomId) {
    showRoomError('DB 연결 실패 상태에서는 가구를 조작할 수 없습니다.')
    return
  }
  if (!state.selectedItemInstanceId) return
  const item = state.placedItems.find(i => i.id === state.selectedItemInstanceId)
  if (!item) return
  const meta = FURNITURE_CATALOG.find(f => f.id === item.furniture_id)
  if (!meta) return

  // 이전 상태 백업 (실패 시 롤백용)
  const prevRot = item.rotation || 0
  const prevX = item.x
  const prevY = item.y

  // 90도 단위 회전 (0° -> 90° -> 180° -> 270° -> 0°)
  const newRot = ((item.rotation || 0) + 90) % 360
  item.rotation = newRot

  // 회전된 점유 칸 기준으로 방 경계를 벗어나지 않도록 좌표 보정
  const { spanW, spanH } = getItemSpan(item, meta)
  const newX = Math.max(0, Math.min(ISO_GRID.cols - spanW, item.x))
  const newY = Math.max(0, Math.min(ISO_GRID.rows - spanH, item.y))
  item.x = newX
  item.y = newY

  renderPlacedItems()

  try {
    // 단건 UPDATE: room_placed_items (rotation, x, y)
    const { error } = await supabase
      .from('room_placed_items')
      .update({
        rotation: newRot,
        x: newX,
        y: newY,
        updated_at: new Date().toISOString()
      })
      .eq('id', item.id)
      .eq('room_id', state.currentRoomId)

    if (error) {
      throw error
    }

    try {
      localStorage.setItem(STORAGE_KEY_PLACED, JSON.stringify(state.placedItems))
    } catch (e) {}

    const rotMsg = newRot === 0
      ? '가구 회전을 원래 각도(0°)로 돌렸습니다 🔄'
      : `가구를 90° 회전했습니다 (${newRot}°) 🔄`
    showToast(rotMsg)
  } catch (err) {
    console.error('가구 회전(UPDATE) 실패:', err)
    // 롤백: 이전 상태 복원
    item.rotation = prevRot
    item.x = prevX
    item.y = prevY
    renderPlacedItems()
    const msg = formatPlacementError(err)
    showToast(msg, 'error')
    showRoomError(msg)
  }
}

export async function flipSelectedItem() {
  if (!state.isDbConnected || !state.currentRoomId) {
    showRoomError('DB 연결 실패 상태에서는 가구를 조작할 수 없습니다.')
    return
  }
  if (!state.selectedItemInstanceId) return
  const item = state.placedItems.find(i => i.id === state.selectedItemInstanceId)
  if (!item) return

  // 이전 상태 백업 (실패 시 롤백용)
  const prevFlipH = Boolean(item.flipH)
  const newFlipH = !prevFlipH

  item.flipH = newFlipH
  renderPlacedItems()

  try {
    // 단건 UPDATE: room_placed_items (flip_h)
    const { error } = await supabase
      .from('room_placed_items')
      .update({
        flip_h: newFlipH,
        updated_at: new Date().toISOString()
      })
      .eq('id', item.id)
      .eq('room_id', state.currentRoomId)
      .eq('space_id', state.currentSpaceId)

    if (error) {
      throw error
    }

    try {
      localStorage.setItem(STORAGE_KEY_PLACED, JSON.stringify(state.placedItems))
    } catch (e) {}

    showToast(newFlipH ? '가구를 좌우 반전했습니다 ↔️' : '가구 좌우 반전을 원래대로 돌렸습니다 ↔️')
  } catch (err) {
    console.error('가구 반전(UPDATE) 실패:', err)
    // 롤백: 이전 상태 복원
    item.flipH = prevFlipH
    renderPlacedItems()
    const msg = formatPlacementError(err)
    showToast(msg, 'error')
    showRoomError(msg)
  }
}

export async function removeSelectedItemToInventory() {
  if (!state.isDbConnected || !state.currentRoomId) {
    showRoomError('DB 연결 실패 상태에서는 가구를 조작할 수 없습니다.')
    return
  }
  if (!state.selectedItemInstanceId) return
  const itemIndex = state.placedItems.findIndex(i => i.id === state.selectedItemInstanceId)
  if (itemIndex === -1) return

  const item = state.placedItems[itemIndex]
  const meta = FURNITURE_CATALOG.find(f => f.id === item.furniture_id)
  const prevSelectedId = state.selectedItemInstanceId

  // 화면 선반영 및 집 전체 카운트 차감
  state.placedItems.splice(itemIndex, 1)
  state.selectedItemInstanceId = null
  state.housePlacedCounts[item.furniture_id] = Math.max(0, (state.housePlacedCounts[item.furniture_id] || 1) - 1)

  renderPlacedItems()
  renderInventory()

  try {
    // 단건 DELETE: room_placed_items (space_id 포함)
    const { error } = await supabase
      .from('room_placed_items')
      .delete()
      .eq('id', item.id)
      .eq('room_id', state.currentRoomId)
      .eq('space_id', state.currentSpaceId)

    if (error) {
      throw error
    }

    try {
      localStorage.setItem(STORAGE_KEY_PLACED, JSON.stringify(state.placedItems))
    } catch (e) {}

    showToast(`[${meta ? meta.name : '가구'}]을(를) 보관함에 넣었습니다 📦`)
  } catch (err) {
    console.error('가구 보관(DELETE) 실패:', err)
    // 롤백: 제거했던 가구 및 집 전체 카운트 복원
    state.placedItems.splice(itemIndex, 0, item)
    state.housePlacedCounts[item.furniture_id] = (state.housePlacedCounts[item.furniture_id] || 0) + 1
    state.selectedItemInstanceId = prevSelectedId
    renderPlacedItems()
    renderInventory()
    const msg = formatPlacementError(err)
    showToast(msg, 'error')
    showRoomError(msg)
  }
}

// ==========================================================================
// 7. 인벤토리(보관함) 서랍 & 배경 장착 / 가구 아이소메트릭 그리드 배치
// ==========================================================================
export function setInventoryFilter(filter) {
  state.activeInventoryFilter = filter
  document.querySelectorAll('.inv-filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.invfilter === filter)
  })
  renderInventory()
}

export function renderInventory() {
  const grid = document.getElementById('inventory-grid')
  const countBadge = document.getElementById('inventory-count-badge')
  if (!grid) return

  // 보유 중인 아이템 목록 (수량 > 0 또는 현재 장착 중인 배경)
  const ownedItemIds = Object.keys(state.inventory).filter(id => (state.inventory[id] || 0) > 0)
  // 현재 장착 중인 배경이 인벤토리에 누락되어 있다면 자동 포함
  ;['wallpaper', 'flooring', 'window'].forEach(cat => {
    const bgId = state.roomTheme[cat]
    if (bgId && !ownedItemIds.includes(bgId) && FURNITURE_CATALOG.some(f => f.id === bgId)) {
      ownedItemIds.push(bgId)
      state.inventory[bgId] = 1
    }
  })

  if (countBadge) countBadge.innerText = ownedItemIds.length

  if (!state.isDbConnected) {
    grid.innerHTML = `
      <div class="panel-empty-state panel-empty-full">
        <div class="panel-empty-icon">⚠️</div>
        <div class="panel-empty-text" style="color: #ef4444; font-weight: 600;">DB 연결 실패<br><span style="font-size: 13px; color: #64748b; font-weight: 400;">서버 연결 실패로 보관함 및 가구 배치가 비활성화되었습니다.</span></div>
      </div>
    `
    return
  }

  if (ownedItemIds.length === 0) {
    grid.innerHTML = `
      <div class="panel-empty-state panel-empty-full">
        <div class="panel-empty-icon">🎒</div>
        <div class="panel-empty-text">보관함이 비어있습니다.<br>상점에서 모던 가구와 배경을 둘러보세요!</div>
      </div>
    `
    return
  }

  // 보관함 필터링 (전체 / 가구 / 배경)
  let invItems = ownedItemIds.map(itemId => {
    const item = FURNITURE_CATALOG.find(f => f.id === itemId)
    return { item, itemId }
  }).filter(entry => entry.item !== undefined)

  if (state.activeInventoryFilter === 'furniture') {
    invItems = invItems.filter(entry => !['wallpaper', 'flooring', 'window'].includes(entry.item.category))
  } else if (state.activeInventoryFilter === 'background') {
    invItems = invItems.filter(entry => ['wallpaper', 'flooring', 'window'].includes(entry.item.category))
  }

  if (invItems.length === 0) {
    grid.innerHTML = `
      <div class="panel-empty-state panel-empty-full">
        <div class="panel-empty-icon">📦</div>
        <div class="panel-empty-text">해당 카테고리의 보관된 아이템이 없습니다.</div>
      </div>
    `
    return
  }

  grid.innerHTML = invItems.map(({ item, itemId }) => {
    const isBg = ['wallpaper', 'flooring', 'window'].includes(item.category)
    const isEquipped = isBg && state.roomTheme[item.category] === item.id

    const totalQty = state.inventory[itemId] || (isEquipped ? 1 : 0)
    const placedCount = state.housePlacedCounts[itemId] || 0
    const remainingQty = isBg ? (isEquipped ? 0 : 1) : Math.max(0, totalQty - placedCount)
    const isExhausted = !isBg && remainingQty === 0

    let actionBtn = ''
    if (!state.isDbConnected) {
      actionBtn = `<button type="button" class="btn-card-action btn-card-disabled" disabled title="DB 연결 실패로 배치가 비활성화되었습니다">배치 불가</button>`
    } else if (isBg) {
      if (isEquipped) {
        actionBtn = `<button type="button" class="btn-card-unequip" onclick="window.mineroom.unequipBackground('${item.category}')">장착 해제</button>`
      } else {
        actionBtn = `<button type="button" class="btn-card-equip" onclick="window.mineroom.equipBackground('${item.id}')">장착하기</button>`
      }
    } else {
      if (isExhausted) {
        actionBtn = `<button type="button" class="btn-card-action btn-card-disabled" disabled>배치중</button>`
      } else {
        actionBtn = `<button type="button" class="btn-card-action btn-card-place" onclick="window.mineroom.placeFromInventory('${itemId}')">방에 배치</button>`
      }
    }

    const badgeLabel = isBg
      ? (item.category === 'wallpaper' ? '벽지' : item.category === 'flooring' ? '바닥재' : '창문')
      : `${item.baseW}x${item.baseH}`

    const qtyHtml = isBg
      ? (isEquipped ? `<div class="card-qty-info">남은 수량: <strong>0</strong> / 보유 수량: ${totalQty} (장착 중)</div>` : `<div class="card-qty-info">남은 수량: <strong>${remainingQty}</strong> / 보유 수량: ${totalQty}</div>`)
      : `<div class="card-qty-info">남은 수량: <strong>${remainingQty}</strong> / 보유 수량: ${totalQty}</div>`

    return `
      <div class="furniture-card inventory-card ${isExhausted ? 'is-exhausted' : ''}" data-furniture-id="${item.id}" data-is-bg="${isBg}" data-remaining="${remainingQty}">
        <div class="furniture-card-thumb">
          <span class="card-size-badge">${badgeLabel}</span>
          ${isEquipped ? '<span class="card-equipped-tag">✓ 장착 중</span>' : ''}
          ${isExhausted ? '<span class="card-placed-tag">배치중</span>' : ''}
          ${renderFurnitureResource(item)}
        </div>
        <div class="furniture-card-info">
          <h4 class="card-item-name">${item.name}</h4>
          ${qtyHtml}
        </div>
        <div class="card-action-row">
          <div class="card-price">🪙 ${item.price}P</div>
          ${actionBtn}
        </div>
      </div>
    `
  }).join('')

  attachInventoryCardDrag()
}

// 배경 아이템 장착 함수
export function equipBackground(itemId) {
  if (!state.isDbConnected) {
    showRoomError('DB 연결 실패 상태에서는 배경을 장착할 수 없습니다.')
    return
  }
  const item = FURNITURE_CATALOG.find(f => f.id === itemId)
  if (!item) return

  const cat = item.category
  if (!['wallpaper', 'flooring', 'window'].includes(cat)) return

  state.roomTheme[cat] = itemId
  localStorage.setItem(STORAGE_KEY_THEME, JSON.stringify(state.roomTheme))

  renderIsoScene()
  renderInventory()
  const catName = cat === 'wallpaper' ? '벽지' : cat === 'flooring' ? '바닥재' : '창문'
  showToast(`[${item.name}] ${catName}을(를) 방에 장착했습니다! ✨`, 'success')
}

// 배경 아이템 장착 해제 함수 (기본 스타일로 복귀)
export function unequipBackground(category) {
  if (!state.isDbConnected) {
    showRoomError('DB 연결 실패 상태에서는 배경을 장착 해제할 수 없습니다.')
    return
  }
  if (!['wallpaper', 'flooring', 'window'].includes(category)) return

  state.roomTheme[category] = null
  localStorage.setItem(STORAGE_KEY_THEME, JSON.stringify(state.roomTheme))

  renderIsoScene()
  renderInventory()
  const catName = category === 'wallpaper' ? '벽지' : category === 'flooring' ? '바닥재' : '창문'
  showToast(`[${catName}] 장착을 해제하고 기본 스타일로 복귀했습니다.`, 'normal')
}

function attachInventoryCardDrag() {
  if (!state.isDbConnected) return

  const cards = document.querySelectorAll('.inventory-card')
  cards.forEach(card => {
    // 배경 아이템은 방 캔버스 드래그 대상이 아니므로 이벤트 제외
    if (card.dataset.isBg === 'true') return
    // 남은 수량이 0인 카드는 드래그 제외
    if (card.dataset.remaining === '0' || card.classList.contains('is-exhausted')) return

    let isDown = false
    let startX = 0
    let startY = 0
    let isDragging = false
    const itemId = card.dataset.furnitureId
    const meta = FURNITURE_CATALOG.find(f => f.id === itemId)

    card.addEventListener('pointerdown', (e) => {
      if (!state.isDbConnected) return
      if (e.target.closest('button')) return

      // 실시간 잔여 수량 재검증 (집 전체 배치 수량 기준)
      const totalQty = state.inventory[itemId] || 0
      const placedCount = state.housePlacedCounts[itemId] || 0
      if (totalQty - placedCount <= 0) return

      isDown = true
      startX = e.clientX
      startY = e.clientY
      isDragging = false
      card.setPointerCapture(e.pointerId)
    })

    card.addEventListener('pointermove', (e) => {
      if (!isDown) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY

      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        isDragging = true

        const stage = getSceneElement()
        if (stage && meta) {
          const rect = stage.getBoundingClientRect()
          const px = e.clientX - rect.left
          const py = e.clientY - rect.top
          const tile = screenToIso(px, py, stage.clientWidth)

          if (tile) {
            const targetCol = Math.max(0, Math.min(ISO_GRID.cols - meta.baseW, tile.col))
            const targetRow = Math.max(0, Math.min(ISO_GRID.rows - meta.baseH, tile.row))
            const isValid = tile.col >= 0 && (tile.col + meta.baseW) <= ISO_GRID.cols &&
                            tile.row >= 0 && (tile.row + meta.baseH) <= ISO_GRID.rows
            highlightCandidate(targetCol, targetRow, meta)
            renderFootprintPreview(targetCol, targetRow, meta.baseW, meta.baseH, isValid, true)
          } else {
            clearHighlights()
            renderFootprintPreview(null, null)
          }
        }
      }
    })

    card.addEventListener('pointerup', (e) => {
      if (!isDown) return
      isDown = false
      clearHighlights()
      renderFootprintPreview(null, null)

      if (isDragging && meta) {
        const stage = getSceneElement()
        if (stage) {
          const rect = stage.getBoundingClientRect()
          const px = e.clientX - rect.left
          const py = e.clientY - rect.top
          const tile = screenToIso(px, py, stage.clientWidth)

          if (tile) {
            placeAtCoordinates(itemId, tile.col, tile.row)
            return
          }
        }
      }
    })
  })
}

async function placeAtCoordinates(itemId, col, row) {
  if (!state.isDbConnected || !state.currentRoomId || !state.currentSpaceId) {
    showRoomError('DB 연결 실패 상태에서는 가구를 배치할 수 없습니다.')
    return
  }
  const meta = FURNITURE_CATALOG.find(f => f.id === itemId)
  if (!meta) return

  // 집 전체 배치 수량 기준 잔여량 검증
  const totalQty = state.inventory[itemId] || 0
  const totalPlacedCount = state.housePlacedCounts[itemId] || 0
  if (totalQty - totalPlacedCount <= 0) {
    showToast(`[${meta.name}]의 남은 수량이 없습니다! (모두 배치됨)`, 'error')
    return
  }

  const clampedX = Math.max(0, Math.min(ISO_GRID.cols - meta.baseW, col))
  const clampedY = Math.max(0, Math.min(ISO_GRID.rows - meta.baseH, row))

  // 충돌 방지 고유 ID 생성 (room_id 포함 UUID)
  const newInstanceId = generatePlacedItemId()
  const newItem = {
    id: newInstanceId,
    space_id: state.currentSpaceId,
    furniture_id: itemId,
    x: clampedX,
    y: clampedY,
    rotation: 0,
    flipH: false
  }

  // 화면 선반영 및 집 전체 카운트 갱신
  state.placedItems.push(newItem)
  state.housePlacedCounts[itemId] = totalPlacedCount + 1

  if (!state.isEditing) {
    toggleEditMode(true)
  }
  selectItem(newInstanceId)

  renderPlacedItems()
  renderInventory()
  renderSpaceTabs()
  renderShopTab()

  try {
    // 단건 INSERT: room_placed_items (space_id 포함)
    const { error } = await supabase
      .from('room_placed_items')
      .insert({
        id: newItem.id,
        room_id: state.currentRoomId,
        space_id: state.currentSpaceId,
        furniture_id: newItem.furniture_id,
        x: newItem.x,
        y: newItem.y,
        rotation: newItem.rotation,
        flip_h: newItem.flipH,
        updated_at: new Date().toISOString()
      })

    if (error) {
      throw error
    }

    try {
      localStorage.setItem(STORAGE_KEY_PLACED, JSON.stringify(state.placedItems))
    } catch (e) {}

    showToast(`[${meta.name}]이(가) (${clampedX + 1}, ${clampedY + 1})에 배치되었습니다! ✨`)
  } catch (err) {
    console.error('가구 꺼내기(INSERT) 실패:', err)
    // 롤백: 방금 추가한 가구 제거 및 집 전체 카운트 복원
    state.placedItems = state.placedItems.filter(p => p.id !== newInstanceId)
    state.housePlacedCounts[itemId] = Math.max(0, (state.housePlacedCounts[itemId] || 1) - 1)
    if (state.selectedItemInstanceId === newInstanceId) {
      state.selectedItemInstanceId = null
    }
    renderPlacedItems()
    renderInventory()
    renderShopTab()
    const msg = formatPlacementError(err)
    showToast(msg, 'error')
    showRoomError(msg)
  }
}

export async function placeFromInventory(itemId) {
  if (!state.isDbConnected || !state.currentRoomId || !state.currentSpaceId) {
    showRoomError('DB 연결 실패 상태에서는 가구를 배치할 수 없습니다.')
    return
  }
  const meta = FURNITURE_CATALOG.find(f => f.id === itemId)
  if (!meta) return

  // 집 전체 배치 수량 기준 잔여량 검증
  const totalQty = state.inventory[itemId] || 0
  const placedCount = state.housePlacedCounts[itemId] || 0
  if (totalQty - placedCount <= 0) {
    showToast(`[${meta.name}]의 남은 수량이 없습니다! (모두 배치됨)`, 'error')
    return
  }

  let foundX = -1
  let foundY = -1

  for (let r = 0; r <= ISO_GRID.rows - meta.baseH; r++) {
    for (let c = 0; c <= ISO_GRID.cols - meta.baseW; c++) {
      const overlap = state.placedItems.some(placed => {
        const pMeta = FURNITURE_CATALOG.find(f => f.id === placed.furniture_id)
        if (!pMeta) return false
        const { spanW: pW, spanH: pH } = getItemSpan(placed, pMeta)

        return (
          c < placed.x + pW &&
          c + meta.baseW > placed.x &&
          r < placed.y + pH &&
          r + meta.baseH > placed.y
        )
      })

      if (!overlap) {
        foundX = c
        foundY = r
        break
      }
    }
    if (foundX !== -1) break
  }

  if (foundX === -1) {
    foundX = 0
    foundY = 0
  }

  await placeAtCoordinates(itemId, foundX, foundY)
}

// ==========================================================================
// 8. 인라인 가구 상점 (Shop Tab) & 스페셜 해금 통합
// ==========================================================================
export function openShopModal() {
  setPanelTab('shop')
}

export function closeShopModal() {
  setPanelTab('inventory')
}

export function setShopBgSubFilter(sub) {
  state.activeShopBgSubFilter = sub
  document.querySelectorAll('.shop-subfilter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.bgsub === sub)
  })
  renderShopTab()
}

export function renderShopTab() {
  const grid = document.getElementById('shop-furniture-grid')
  const summaryEl = document.getElementById('shop-special-summary')
  const bgSubBar = document.getElementById('shop-bg-subfilter-bar')
  if (!grid) return

  const isSpecialMode = state.activeShopFilter === 'special'
  const isBgMode = state.activeShopFilter === 'background'

  // 배경 서브필터 바 노출 토글
  if (bgSubBar) {
    bgSubBar.style.display = isBgMode ? 'flex' : 'none'
  }

  // 스페셜 해금 필터일 경우 목표 달성 현황 카드 렌더링
  if (summaryEl) {
    if (isSpecialMode) {
      summaryEl.innerHTML = `
        <div class="special-summary-title">🏆 목표 달성 및 스페셜 해금 현황</div>
        <div class="special-summary-grid">
          <div class="special-summary-card">
            <span class="special-summary-card-label">현재 총자산</span>
            <span class="special-summary-card-val">${state.totalAsset.toLocaleString()}원</span>
          </div>
          <div class="special-summary-card">
            <span class="special-summary-card-label">달성한 금융 목표</span>
            <span class="special-summary-card-val">${state.achievedGoalsCount}개 달성</span>
          </div>
        </div>
        <div class="special-summary-tip">💡 금융 목표를 달성하거나 자산을 모으면 머니룸의 특별한 오브제가 무료로 해금됩니다!</div>
      `
      summaryEl.classList.add('active')
    } else {
      summaryEl.classList.remove('active')
      summaryEl.innerHTML = ''
    }
  }

  let items = FURNITURE_CATALOG

  if (isSpecialMode) {
    items = items.filter(i => i.special === true)
  } else if (isBgMode) {
    // 배경 카테고리 필터링
    const sub = state.activeShopBgSubFilter || 'all'
    if (sub === 'wallpaper') {
      items = items.filter(i => i.category === 'wallpaper' && !i.special)
    } else if (sub === 'flooring') {
      items = items.filter(i => i.category === 'flooring' && !i.special)
    } else if (sub === 'window') {
      items = items.filter(i => i.category === 'window' && !i.special)
    } else {
      items = items.filter(i => ['wallpaper', 'flooring', 'window'].includes(i.category) && !i.special)
    }
  } else {
    items = items.filter(i => i.category === state.activeShopFilter && !i.special)
  }

  // 가구는 상점에서 절대 숨기지 않고 계속 구매 가능 (배경/스페셜도 리스트에 표시하되 보유 시 비활성화)
  if (items.length === 0) {
    const totalCatalogCount = FURNITURE_CATALOG.length
    const emptyMsg = totalCatalogCount === 0
      ? '등록된 아이템이 아직 없습니다.<br><a href="admin.html" style="display:inline-block; margin-top:8px; color:#8c6a50; font-weight:700; text-decoration:underline;">🛠️ 관리자 페이지에서 새 아이템 등록하기 ➔</a>'
      : '해당 카테고리에 등록된 아이템이 없습니다. 📦'

    grid.innerHTML = `
      <div class="panel-empty-state panel-empty-full">
        <div class="panel-empty-icon">${totalCatalogCount === 0 ? '🛠️' : '📦'}</div>
        <div class="panel-empty-text">${emptyMsg}</div>
      </div>
    `
    return
  }

  grid.innerHTML = items.map(item => {
    const isSpecial = item.special
    const isBg = ['wallpaper', 'flooring', 'window'].includes(item.category)
    const currentOwned = state.inventory[item.id] || 0
    const isOwnedBg = isBg && (currentOwned > 0 || state.roomTheme[item.category] === item.id)
    const isOwnedSpecial = isSpecial && currentOwned > 0

    let isUnlocked = true
    let conditionStatusText = ''
    let conditionBadgeClass = 'badge-unlocked'
    let conditionBadgeLabel = '해금 완료'

    if (isSpecial) {
      if (item.conditionType === 'goal_count') {
        isUnlocked = state.achievedGoalsCount >= item.conditionValue
        conditionStatusText = `현재: ${state.achievedGoalsCount}개 달성 (필요: ${item.conditionValue}개)`
      } else if (item.conditionType === 'total_asset') {
        isUnlocked = state.totalAsset >= item.conditionValue
        conditionStatusText = `현재: ${state.totalAsset.toLocaleString()}원 / ${item.conditionValue.toLocaleString()}원`
      }

      if (!isUnlocked) {
        conditionBadgeClass = 'badge-locked'
        conditionBadgeLabel = '조건 필요'
      }
    }

    let actionBtn = ''
    if (!state.isDbConnected) {
      actionBtn = `<button type="button" class="btn-card-action btn-card-disabled" disabled title="DB 연결 실패로 구매가 비활성화되었습니다">구매 불가</button>`
    } else if (isSpecial) {
      if (isOwnedSpecial) {
        actionBtn = `<button type="button" class="btn-card-action btn-card-disabled" disabled>보유중</button>`
      } else if (isUnlocked) {
        actionBtn = `<button type="button" class="btn-card-action btn-card-buy" onclick="window.mineroom.claimSpecialItem('${item.id}')" ${state.isPurchasing ? 'disabled' : ''}>🎉 무료 수령</button>`
      } else {
        actionBtn = `<button type="button" class="btn-card-action btn-card-disabled" disabled title="${item.conditionDesc}">🔒 해금 필요</button>`
      }
    } else if (isBg) {
      if (isOwnedBg) {
        actionBtn = `<button type="button" class="btn-card-action btn-card-disabled" disabled>보유중</button>`
      } else {
        actionBtn = `<button type="button" class="btn-card-action btn-card-buy" data-buy-id="${item.id}" onclick="window.mineroom.buyItem('${item.id}', event)" ${state.isPurchasing ? 'disabled' : ''}>${state.isPurchasing ? '처리 중...' : '구매하기'}</button>`
      }
    } else {
      actionBtn = `<button type="button" class="btn-card-action btn-card-buy" data-buy-id="${item.id}" onclick="window.mineroom.buyItem('${item.id}', event)" ${state.isPurchasing ? 'disabled' : ''}>${state.isPurchasing ? '처리 중...' : '구매하기'}</button>`
    }

    const badgeLabel = isBg
      ? (item.category === 'wallpaper' ? '벽지' : item.category === 'flooring' ? '바닥재' : '창문')
      : `${item.baseW}x${item.baseH}`

    const ownedInfoHtml = (!isBg && !isSpecial && currentOwned > 0)
      ? `<div class="card-owned-text">보유: ${currentOwned}개</div>`
      : ''

    return `
      <div class="furniture-card">
        <div class="furniture-card-thumb">
          <span class="card-size-badge">${badgeLabel}</span>
          ${isSpecial ? '<span class="card-special-badge">SPECIAL</span>' : ''}
          ${renderFurnitureResource(item)}
        </div>
        <div class="furniture-card-info">
          <h4 class="card-item-name">${item.name}</h4>
          ${ownedInfoHtml}
          ${isSpecial ? `
            <div class="shop-condition-box ${isUnlocked ? 'unlocked' : ''}">
              <div class="condition-header">
                <span class="condition-title">${isUnlocked ? '🔓 해금 완료' : '🔒 해금 조건'}</span>
                <span class="condition-badge-status ${conditionBadgeClass}">${conditionBadgeLabel}</span>
              </div>
              <div class="condition-desc-text">${item.conditionDesc}</div>
              <div class="condition-status-detail ${isUnlocked ? 'unlocked' : 'locked'}">
                ${conditionStatusText}
              </div>
            </div>
          ` : ''}
        </div>
        <div class="card-action-row">
          <div class="card-price">🪙 ${item.price}P</div>
          ${actionBtn}
        </div>
      </div>
    `
  }).join('')
}

export async function buyItem(itemId, event) {
  if (!state.isDbConnected) {
    showRoomError('DB 연결 실패 상태에서는 가구를 구매할 수 없습니다.')
    return
  }

  // 구매 처리 중 연타 중복 구매 방지
  if (state.isPurchasing) {
    return
  }

  if (!state.currentRoomId) {
    showRoomError('방 정보(room_id)가 없습니다. 페이지를 새로고침해주세요.')
    return
  }

  const item = FURNITURE_CATALOG.find(f => f.id === itemId)
  if (!item) {
    showToast('존재하지 않는 가구 아이템입니다.', 'error')
    return
  }

  // 구매 처리 중 버튼 비활성화 (연타 방지)
  state.isPurchasing = true
  const buyButtons = document.querySelectorAll('.btn-card-buy')
  buyButtons.forEach(btn => {
    btn.disabled = true
    if (btn.dataset.buyId === itemId) {
      btn.innerText = '구매 중...'
    }
  })

  try {
    // 1. purchase_furniture(p_room_id, p_furniture_id, p_quantity) RPC만 호출 (가격은 클라이언트에서 보내지 않음)
    const { data, error } = await supabase.rpc('purchase_furniture', {
      p_room_id: state.currentRoomId,
      p_furniture_id: itemId,
      p_quantity: 1
    })

    if (error) {
      throw error
    }

    // 2. RPC가 돌려준 remaining_points로 화면 포인트를 갱신
    if (data && typeof data.remaining_points === 'number') {
      state.roomPoints = data.remaining_points
    }

    // 3. 배경 아이템인 경우 방에 즉시 자동 장착
    const isBg = ['wallpaper', 'flooring', 'window'].includes(item.category)
    if (isBg) {
      state.roomTheme[item.category] = itemId
      try {
        localStorage.setItem(STORAGE_KEY_THEME, JSON.stringify(state.roomTheme))
      } catch (e) {}
      renderIsoScene()
    }

    // 4. 구매 성공 후 DB에서 인벤토리를 다시 불러와 화면 갱신
    await loadRoomInventory()

    renderHeaderStats()
    renderShopTab()
    renderInventory()

    if (isBg) {
      const catName = item.category === 'wallpaper' ? '벽지' : item.category === 'flooring' ? '바닥재' : '창문'
      showToast(`[${item.name}] ${catName}을(를) 구매하여 보관함에 담고 즉시 장착했습니다! ✨`, 'success')
    } else {
      const newQty = state.inventory[itemId] || 1
      showToast(`[${item.name}]을(를) 구매했습니다! (총 보유: ${newQty}개) 🛍️`, 'success')
    }
  } catch (err) {
    console.error('구매 실패:', err)
    // 실패 시 에러 코드(INSUFFICIENT_POINTS, ALREADY_OWNED, ITEM_NOT_FOUND 등)를 한국어 안내 문구로 변환하여 표시
    const koreanMsg = formatPurchaseError(err)
    showToast(koreanMsg, 'error')
  } finally {
    state.isPurchasing = false
    buyButtons.forEach(btn => {
      btn.disabled = false
      if (btn.dataset.buyId === itemId) {
        btn.innerText = '구매하기'
      }
    })
    renderShopTab()
  }
}

export function claimSpecialItem(itemId) {
  if (!state.isDbConnected) {
    showRoomError('DB 연결 실패 상태에서는 아이템을 수령할 수 없습니다.')
    return
  }
  const item = FURNITURE_CATALOG.find(f => f.id === itemId)
  if (!item) return

  if ((state.inventory[itemId] || 0) > 0) {
    showToast('이미 보유하고 있는 특별 아이템입니다.')
    return
  }

  state.inventory[itemId] = 1
  localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(state.inventory))

  renderShopTab()
  renderInventory()
  showToast(`축하합니다! 특별 아이템 [${item.name}]을(를) 수령했습니다! 🏆✨`, 'success')
}

// ==========================================================================
// 9. Supabase 연동: 가구 배치 모드 완료 & 상태 관리 (단건 실시간 반영 방식)
// ==========================================================================
export async function saveMineroomLayout() {
  const saveBtn = document.getElementById('btn-header-mode')
  if (saveBtn) {
    saveBtn.disabled = true
    saveBtn.innerHTML = '<span>완료 중...</span>'
  }

  try {
    // 각 가구 조작 시점에 이미 DB에 단건으로 실시간 안전 저장되었으므로, 전체 삭제/일괄 재삽입은 절대 수행하지 않음
    try {
      localStorage.setItem(STORAGE_KEY_PLACED, JSON.stringify(state.placedItems))
    } catch (e) {}

    state.isDbSynced = true
    updateDbSyncBadge()
    showToast('미니룸 배치가 완료되었습니다! 💾✨', 'success')
  } catch (err) {
    console.warn('배치 완료 처리 안내:', err)
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false
    }
    // 저장 완료 후 둘러보기 모드로 자동 복귀
    toggleEditMode(false)
  }
}

export async function clearAllPlacedItems() {
  if (!state.isDbConnected || !state.currentRoomId || !state.currentSpaceId) {
    showRoomError('DB 연결 실패 상태에서는 가구를 조작할 수 없습니다.')
    return
  }
  if (state.placedItems.length === 0) {
    showToast('방에 배치된 가구가 없습니다.')
    return
  }
  if (!confirm('현재 방에 배치된 모든 가구를 보관함으로 옮기시겠습니까?')) return

  // 이전 배치 백업 (실패 시 롤백용)
  const prevPlaced = [...state.placedItems]

  // 화면 선반영 및 집 전체 카운트 차감
  prevPlaced.forEach(item => {
    state.housePlacedCounts[item.furniture_id] = Math.max(0, (state.housePlacedCounts[item.furniture_id] || 1) - 1)
  })
  state.placedItems = []
  state.selectedItemInstanceId = null
  renderPlacedItems()
  renderInventory()

  try {
    // DB에서 현재 방(space_id)의 모든 배치 삭제
    const { error } = await supabase
      .from('room_placed_items')
      .delete()
      .eq('room_id', state.currentRoomId)
      .eq('space_id', state.currentSpaceId)

    if (error) {
      throw error
    }

    try {
      localStorage.setItem(STORAGE_KEY_PLACED, JSON.stringify(state.placedItems))
    } catch (e) {}

    showToast('현재 방의 모든 가구를 보관함으로 회수했습니다 🧹')
  } catch (err) {
    console.error('현재 방 비우기(DELETE) 실패:', err)
    // 롤백: 이전 배치 상태 복원 및 집 전체 카운트 복원
    prevPlaced.forEach(item => {
      state.housePlacedCounts[item.furniture_id] = (state.housePlacedCounts[item.furniture_id] || 0) + 1
    })
    state.placedItems = prevPlaced
    renderPlacedItems()
    renderInventory()
    const msg = formatPlacementError(err)
    showToast(msg, 'error')
    showRoomError(msg)
  }
}

// ==========================================================================
// 10. UI 모드 전환 및 인터랙션 컨트롤러
// ==========================================================================
function renderHeaderStats() {
  const ptEl = document.getElementById('stat-room-points')
  const assetEl = document.getElementById('stat-total-asset')

  if (ptEl) ptEl.innerText = `${state.roomPoints.toLocaleString()}P`
  if (assetEl) assetEl.innerText = `${state.totalAsset.toLocaleString()}원`
}

// --------------------------------------------------------------------------
// 10-1. 다중 방 전환 칩 탭 바 렌더링
// --------------------------------------------------------------------------
export function renderSpaceTabs() {
  const container = document.getElementById('mineroom-space-tabs')
  if (!container) return

  const isLockedActionDisabled = state.isSwitchingSpace || !state.isDbConnected

  container.innerHTML = SPACE_TYPES.map(def => {
    const existingSpace = (state.spaces || []).find(s => s.space_type === def.type)

    if (existingSpace) {
      const isActive = existingSpace.id === state.currentSpaceId
      const disabledAttr = state.isSwitchingSpace ? 'disabled' : ''
      return `
        <button type="button" 
          class="space-tab-chip ${isActive ? 'active' : ''}" 
          data-space-id="${existingSpace.id}"
          ${disabledAttr}
          onclick="window.mineroom.switchSpace('${existingSpace.id}')"
          title="${existingSpace.name || def.name} (${existingSpace.grid_cols}x${existingSpace.grid_rows})">
          <span>${def.icon}</span>
          <span>${existingSpace.name || def.name}</span>
        </button>
      `
    } else {
      const disabledAttr = isLockedActionDisabled ? 'disabled' : ''
      return `
        <button type="button" 
          class="space-tab-chip is-locked" 
          data-space-type="${def.type}"
          ${disabledAttr}
          onclick="window.mineroom.handleLockedSpaceClick('${def.type}')"
          title="해금 조건 준비 중">
          <span>🔒</span>
          <span>${def.name}</span>
          <span class="chip-lock-desc">(해금 조건 준비 중)</span>
        </button>
      `
    }
  }).join('')
}

// --------------------------------------------------------------------------
// 10-2. 잠금 방 클릭 시 해금 및 생성 RPC 호출 (unlock_and_create_space)
// --------------------------------------------------------------------------
export async function handleLockedSpaceClick(spaceType) {
  if (state.isSwitchingSpace) return

  if (!state.isDbConnected || !state.currentRoomId) {
    showRoomError('DB 연결 실패 상태에서는 방을 해금할 수 없습니다.')
    return
  }

  const def = SPACE_TYPES.find(d => d.type === spaceType)
  const typeName = def ? def.name : spaceType

  // 처리 중 버튼 비활성화 및 연타 방지
  state.isSwitchingSpace = true
  renderSpaceTabs()

  try {
    const { data, error } = await supabase.rpc('unlock_and_create_space', {
      p_room_id: state.currentRoomId,
      p_space_type: spaceType
    })

    if (error) {
      throw error
    }

    if (data && data.success && data.space_id) {
      // 1. 최신 방 목록 DB 재조회하여 state.spaces 갱신
      const { data: spacesData, error: sErr } = await supabase
        .from('room_spaces')
        .select('*')
        .eq('room_id', state.currentRoomId)
        .order('sort_order', { ascending: true })

      if (!sErr && spacesData) {
        state.spaces = spacesData
      }

      showToast(`[${data.name || typeName}] 공간이 성공적으로 해금되었습니다! ✨`, 'success')

      // 2. 해금된 신규 방으로 즉시 전환
      await switchSpace(data.space_id)
    }
  } catch (err) {
    console.warn('방 해금 요청 안내:', err)
    const msg = err.message || err.details || String(err || '')

    if (msg.includes('ROOM_LOCKED')) {
      showToast(`[${typeName}]은(는) 아직 해금되지 않은 방입니다. (해금 조건 준비 중)`, 'normal')
    } else if (msg.includes('ALREADY_EXISTS')) {
      showToast(`이미 생성된 방입니다.`, 'normal')
    } else if (msg.includes('INVALID_NAME')) {
      showToast(`방 이름은 20자 이하여야 합니다.`, 'error')
    } else {
      showToast(`방 해금 실패: ${msg}`, 'error')
    }
  } finally {
    state.isSwitchingSpace = false
    renderSpaceTabs()
  }
}

// --------------------------------------------------------------------------
// 10-3. 활성화된 방 전환 함수 (다중 방 스위칭)
// --------------------------------------------------------------------------
export async function switchSpace(spaceId) {
  if (!spaceId || state.isSwitchingSpace) return

  // 이미 현재 방인 경우 불필요한 재전환 생략
  if (spaceId === state.currentSpaceId) return

  const targetSpace = (state.spaces || []).find(s => s.id === spaceId)
  if (!targetSpace) {
    showToast('존재하지 않는 방입니다.', 'error')
    return
  }

  // 1. 방 전환 중 처리 플래그 설정 및 버튼 비활성화
  state.isSwitchingSpace = true

  // 2. 가구 드래그/선택 상태 초기화
  selectItem(null)
  clearHighlights()
  renderFootprintPreview(null, null)
  renderSpaceTabs()

  try {
    // 3. state.currentSpaceId 변경
    state.currentSpaceId = spaceId

    // 4. 방 테마(벽지/바닥/창문)를 해당 방 행에서 읽기
    state.roomTheme.wallpaper = targetSpace.wallpaper_id || null
    state.roomTheme.flooring = targetSpace.flooring_id || null
    state.roomTheme.window = targetSpace.window_id || null

    // 5. 해당 방의 grid_cols/grid_rows로 2.5D 아이소메트릭 씬 재렌더링
    renderIsoScene()

    // 6. 해당 방의 가구만 로드 및 표시
    await loadRoomPlacements()
    renderPlacedItems()

    // 7. 보관함 수량 갱신 (보관함 남은 수량은 집 전체 housePlacedCounts 기준으로 유지)
    renderInventory()

    showToast(`[${targetSpace.name}] 공간으로 전환했습니다 🚪`)
  } catch (err) {
    console.error('방 전환 중 오류:', err)
    showToast('방 전환 중 오류가 발생했습니다.', 'error')
  } finally {
    state.isSwitchingSpace = false
    renderSpaceTabs()
  }
}

export function handleHeaderModeClick() {
  if (!state.isDbConnected) {
    showRoomError('DB 연결 실패 상태에서는 방을 꾸밀 수 없습니다.')
    return
  }
  if (!state.isEditing) {
    toggleEditMode(true)
  } else {
    saveMineroomLayout()
  }
}

export function toggleEditMode(forceState) {
  if (!state.isDbConnected) {
    state.isEditing = false
    return
  }
  state.isEditing = (typeof forceState === 'boolean') ? forceState : !state.isEditing
  const stage = document.getElementById('mineroom-stage')
  const btnHeader = document.getElementById('btn-header-mode')
  const toolbar = document.querySelector('.room-toolbar')

  if (stage) {
    stage.classList.toggle('is-editing', state.isEditing)
  }
  if (toolbar) {
    toolbar.classList.toggle('is-editing', state.isEditing)
  }

  if (btnHeader) {
    if (state.isEditing) {
      btnHeader.className = 'btn-mode-toggle btn-mode-save'
      btnHeader.innerHTML = '<span>💾 배치 저장</span>'
      btnHeader.title = '현재 배치 저장하기'
      setPanelTab('inventory')
      showToast('🎨 방 꾸미기 모드입니다. 가구를 자유롭게 배치해보세요!', 'normal')
    } else {
      btnHeader.className = 'btn-mode-toggle'
      btnHeader.innerHTML = '<span>🎨 방 꾸미기</span>'
      btnHeader.title = '방 꾸미기 모드로 전환'
      selectItem(null)
    }
  }

  updateToolbarSelectionStatus()
  renderPlacedItems()
}

export function setShopFilter(filterName) {
  state.activeShopFilter = filterName
  document.querySelectorAll('.shop-filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === filterName)
  })
  renderShopTab()
}

export function setPanelTab(tabName) {
  state.activePanelTab = tabName
  document.querySelectorAll('.panel-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName)
  })
  document.querySelectorAll('.panel-tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabName}`)
  })
  if (tabName === 'shop') {
    renderShopTab()
  } else if (tabName === 'inventory') {
    renderInventory()
  }
}

// 토스트 메시지
let toastTimer = null
export function showToast(message, type = 'normal') {
  const toast = document.getElementById('mineroom-toast')
  if (!toast) return

  toast.innerText = message
  toast.className = `mineroom-toast show ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`

  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.classList.remove('show')
  }, 2800)
}

// SQL 모달
export function openSqlModal() {
  const modal = document.getElementById('sql-modal')
  if (modal) modal.classList.add('open')
}

export function closeSqlModal() {
  const modal = document.getElementById('sql-modal')
  if (modal) modal.classList.remove('open')
}

export function copySqlCode() {
  const code = document.getElementById('sql-code-text')?.innerText || ''
  navigator.clipboard.writeText(code).then(() => {
    showToast('SQL 스크립트가 클립보드에 복사되었습니다! 📋', 'success')
  }).catch(() => {
    showToast('복사에 실패했습니다. 직접 복사해주세요.')
  })
}

// ==========================================================================
// 11. 윈도우 리사이즈 대응 & 전역 스코프 등록
// ==========================================================================
window.addEventListener('resize', () => {
  renderIsoScene()
  renderPlacedItems()
})

window.mineroom = {
  loadFurnitureCatalog,
  renderFurnitureResource,
  getFurnitureAnchor,
  getFootprintDiamond,
  getItemSpan,
  toggleEditMode,
  handleHeaderModeClick,
  selectItem,
  rotateSelectedItem,
  flipSelectedItem,
  removeSelectedItemToInventory,
  saveMineroomLayout,
  clearAllPlacedItems,
  openShopModal,
  closeShopModal,
  buyItem,
  claimSpecialItem,
  placeFromInventory,
  setShopFilter,
  setShopBgSubFilter,
  setInventoryFilter,
  setPanelTab,
  renderShopTab,
  renderInventory,
  equipBackground,
  unequipBackground,
  openSqlModal,
  closeSqlModal,
  copySqlCode,
  loadPersonalRoom,
  showRoomError,
  updateDbDisabledState,
  loadRoomInventory,
  loadRoomPlacements,
  formatPurchaseError,
  formatPlacementError,
  generatePlacedItemId,
  placeAtCoordinates,
  SPACE_TYPES,
  renderSpaceTabs,
  switchSpace,
  handleLockedSpaceClick
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    await initMineroomData()
    await loadFinancialData()
  })
}
