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
    svgData: row.svg_data || ''
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
export function renderFurnitureResource(item) {
  if (!item) return ''
  const imgUrl = item.imageUrl || item.image_url
  const svgContent = item.svgData || item.svg_data

  if (imgUrl) {
    return `<img src="${imgUrl}" class="furniture-resource-img" alt="${item.name}" draggable="false" />`
  }
  if (svgContent) {
    return `<div class="furniture-resource-svg">${svgContent}</div>`
  }

  // 리소스 미등록 시 단정하고 귀여운 2.5D 미니어처 플레이스홀더
  const icon = item.category === 'bed' ? '🛏️'
             : item.category === 'desk-chair' ? '🪑'
             : item.category === 'sofa-rug' ? '🛋️'
             : item.category === 'wallpaper' ? '🖼️'
             : item.category === 'flooring' ? '🪵'
             : item.category === 'window' ? '🪟'
             : item.category === 'special' ? '🏆'
             : '🪴'

  const isBackground = ['wallpaper', 'flooring', 'window'].includes(item.category)
  const sizeLabel = isBackground ? '배경' : `${item.baseW}x${item.baseH}`

  return `
    <div class="furniture-resource-placeholder">
      <span class="placeholder-icon">${icon}</span>
      <span class="placeholder-size">${sizeLabel}</span>
    </div>
  `
}

// ==========================================================================
// 1-2. 방 평형대 확장 티어 시스템 (자산 & 목표 달성 연동 원룸 -> 1.5룸 -> 펜트하우스)
// ==========================================================================
export const ROOM_TIERS = {
  studio: {
    id: 'studio',
    name: '스튜디오 원룸',
    badge: '8x8 아늑한 원룸',
    cols: 8,
    rows: 8,
    tileW: 44,
    tileH: 22,
    originY: 88,
    slabH: 16,
    wallH: 70,
    minAsset: 0,
    minGoals: 0,
    desc: '아늑하고 컴팩트한 기본 원룸 공간'
  },
  one_room_plus: {
    id: 'one_room_plus',
    name: '미드센추리 1.5룸',
    badge: '10x10 와이드 1.5룸',
    cols: 10,
    rows: 10,
    tileW: 36.5,
    tileH: 18.25,
    originY: 82,
    slabH: 16,
    wallH: 66,
    minAsset: 10000000,
    minGoals: 2,
    desc: '침실과 거실이 여유롭게 분리되는 1.5룸 확장형 공간'
  },
  penthouse: {
    id: 'penthouse',
    name: '프리미엄 펜트하우스',
    badge: '12x12 럭셔리 펜트하우스',
    cols: 12,
    rows: 12,
    tileW: 31.5,
    tileH: 15.75,
    originY: 78,
    slabH: 16,
    wallH: 62,
    minAsset: 30000000,
    minGoals: 4,
    desc: '최고급 뷰와 넓은 공간을 자랑하는 와이드 펜트하우스'
  }
}

// ==========================================================================
// 2. 미니룸 상태 관리 (State)
// ==========================================================================
const STORAGE_KEY_PLACED = 'moneyroom_mineroom_placed'
const STORAGE_KEY_INVENTORY = 'moneyroom_mineroom_inventory'
const STORAGE_KEY_POINTS = 'moneyroom_mineroom_points'
const STORAGE_KEY_THEME = 'moneyroom_mineroom_theme'
const STORAGE_KEY_TIER = 'moneyroom_mineroom_tier'

export function getGridConfig() {
  const tierKey = state.currentTier || 'studio'
  return ROOM_TIERS[tierKey] || ROOM_TIERS.studio
}

// 2.5D 아이소메트릭 그리드 기하학 파라미터 (Proxy로 현재 티어 동적 연동)
export const ISO_GRID = new Proxy({}, {
  get(target, prop) {
    const config = getGridConfig()
    return config[prop]
  }
})

let state = {
  isEditing: false, // 편집 모드 여부
  totalAsset: 0, // 연동된 총자산
  roomPoints: 1000, // 보유 룸포인트
  achievedGoalsCount: 0, // 달성된 목표 개수
  goals: [], // 전체 목표 목록
  placedItems: [], // 방에 배치된 가구 [{ id, furniture_id, x, y, rotation }]
  inventory: ['sofa_cozy', 'table_tea', 'plant_monstera', 'rug_bear', 'bed_pastel'], // 기본 보유 아이템 목록 (가구 & 배경 통합)
  selectedItemInstanceId: null, // 현재 방에서 선택된 가구의 id
  activeShopFilter: 'bed', // 상점 카테고리 필터 ('bed' | 'desk-chair' | 'sofa-rug' | 'decor-plant' | 'background' | 'special')
  activeShopBgSubFilter: 'all', // 상점 배경 서브필터 ('all' | 'wallpaper' | 'flooring' | 'window')
  activeInventoryFilter: 'all', // 보관함 필터 ('all' | 'furniture' | 'background')
  activePanelTab: 'inventory', // 하단 패널 탭 ('inventory' | 'shop')
  isDbSynced: false, // Supabase DB 동기화 성공 여부

  // 🏠 방 확장 티어 & 커스텀 배경 테마 상태 (장착된 카탈로그 아이템 ID 또는 null)
  currentTier: 'studio', // 'studio' | 'one_room_plus' | 'penthouse'
  roomTheme: {
    wallpaper: null,
    flooring: null,
    window: null
  }
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

    const bonusPoints = Math.floor(state.totalAsset / 100000) * 100
    const savedPoints = localStorage.getItem(STORAGE_KEY_POINTS)
    if (savedPoints === null) {
      state.roomPoints = 1000 + bonusPoints
      localStorage.setItem(STORAGE_KEY_POINTS, String(state.roomPoints))
    } else {
      state.roomPoints = Number(savedPoints)
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

  try {
    const savedInv = localStorage.getItem(STORAGE_KEY_INVENTORY)
    if (savedInv) {
      const parsed = JSON.parse(savedInv)
      // 존재하는 가구 ID만 필터링하여 안전하게 보존
      state.inventory = [...new Set(parsed)].filter(id => FURNITURE_CATALOG.some(f => f.id === id))
      localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(state.inventory))
    } else {
      // 카탈로그에서 무료(0P) 가구가 있으면 기본 보관함에 지급
      const defaultFreeItems = FURNITURE_CATALOG.filter(f => f.price === 0 && !f.special).map(f => f.id)
      state.inventory = defaultFreeItems
      localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(state.inventory))
    }
  } catch (e) {
    console.warn('인벤토리 로드 실패:', e)
  }

  let loadedFromCloud = false
  try {
    const { data, error } = await supabase.from('mineroom_placed').select('*')
    if (!error && Array.isArray(data)) {
      if (data.length > 0) {
        state.placedItems = data.map(row => ({
          id: String(row.id),
          furniture_id: row.furniture_id,
          x: Number(row.x) || 0,
          y: Number(row.y) || 0,
          rotation: Number(row.rotation) || 0,
          flipH: Boolean(row.flip_h || row.fliph || false)
        }))
        // 중복 가구는 하나만 남김
        const seenPlaced = new Set()
        state.placedItems = state.placedItems.filter(item => {
          if (seenPlaced.has(item.furniture_id)) return false
          seenPlaced.add(item.furniture_id)
          return true
        })
        localStorage.setItem(STORAGE_KEY_PLACED, JSON.stringify(state.placedItems))
      }
      state.isDbSynced = true
      loadedFromCloud = true
    } else if (error) {
      console.warn('Supabase 배치 조회 알림:', error.message)
      state.isDbSynced = false
    }
  } catch (e) {
    console.warn('Supabase 연동 대기 (로컬 사용):', e.message)
    state.isDbSynced = false
  }

  if (!loadedFromCloud) {
    try {
      const savedPlaced = localStorage.getItem(STORAGE_KEY_PLACED)
      // 구버전 기본 데이터가 남아있는 경우 신규 기본 배치로 자동 마이그레이션
      const isOldDefault = savedPlaced && (savedPlaced.includes('item_1') && savedPlaced.includes('bed_pastel'))
      if (savedPlaced && !isOldDefault) {
        state.placedItems = JSON.parse(savedPlaced)
        // 중복 가구는 하나만 남김
        const seenPlaced = new Set()
        state.placedItems = state.placedItems.filter(item => {
          if (seenPlaced.has(item.furniture_id)) return false
          seenPlaced.add(item.furniture_id)
          return true
        })
        localStorage.setItem(STORAGE_KEY_PLACED, JSON.stringify(state.placedItems))
      } else {
        // 카탈로그에 존재하는 가구 중 유효한 배치만 남김
        state.placedItems = []
        localStorage.setItem(STORAGE_KEY_PLACED, JSON.stringify(state.placedItems))
      }
    } catch (e) {
      console.warn('로컬 배치 로드 실패:', e)
    }
  }

  // 테마 & 스킨 & 방 평형대 티어 로컬 데이터 복원
  try {
    const savedTheme = localStorage.getItem(STORAGE_KEY_THEME)
    if (savedTheme) state.roomTheme = JSON.parse(savedTheme)

    const savedSkins = localStorage.getItem(STORAGE_KEY_SKINS)
    if (savedSkins) state.unlockedSkins = JSON.parse(savedSkins)

    const savedTier = localStorage.getItem(STORAGE_KEY_TIER)
    if (savedTier && ROOM_TIERS[savedTier]) state.currentTier = savedTier
  } catch (e) {
    console.warn('스킨/티어 복원 실패:', e)
  }

  updateDbSyncBadge()
  renderIsoScene()
  renderPlacedItems()
  renderInventory()
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

    const spanW = meta.baseW
    const spanH = meta.baseH

    // 가구가 차지하는 전체 사선 격자 마름모(Footprint Diamond) 정밀 산출
    const diamond = getFootprintDiamond(item.x, item.y, spanW, spanH, stageWidth)

    const isRug = meta.id.startsWith('rug_') || item.furniture_id.includes('rug')

    // 2.5D 그리드 1:1 정밀 비례 크기 및 앵커 오프셋 (바닥 마름모에 꽉 찬 볼륨감 부여)
    let furnW, furnH, anchorY
    if (isRug) {
      // 2x2 러그: 바닥 마름모에 완벽 밀착
      furnW = 104
      furnH = 64
      anchorY = 38
    } else if (spanW >= 2 && spanH >= 2) {
      // 2x2 대형 가구 (침대): 2x2 바닥 마름모 테두리에 일치
      furnW = 118
      furnH = 96
      anchorY = 58
    } else if (spanW >= 2 || spanH >= 2) {
      // 2x1 또는 1x2 중형 가구 (소파, 책상, 선반장)
      furnW = 96
      furnH = 78
      anchorY = 48
    } else {
      // 1x1 소형 가구 (화분, 협탁, 체어, 조명, 냉장고, 스페셜)
      furnW = 72
      furnH = 72
      anchorY = 52
    }

    const isSelected = state.selectedItemInstanceId === item.id
    if (isSelected) {
      selectedItemFootprint = { col: item.x, row: item.y, spanW, spanH }
    }

    const el = document.createElement('div')
    el.className = `iso-furniture-item ${isSelected ? 'is-selected' : ''}`
    el.dataset.instanceId = item.id

    el.style.width = `${furnW}px`
    el.style.height = `${furnH}px`
    el.style.left = `${diamond.centerX - furnW / 2}px`
    el.style.top = `${diamond.centerY - anchorY}px`

    // 깊이 정렬 (앞쪽 가구가 뒤쪽 가구를 가리는 2.5D Z-Index)
    const zIndex = isRug 
      ? Math.round((item.y + spanH) * 2 + (item.x + spanW))
      : 100 + Math.round((item.y + spanH) * 20 + (item.x + spanW))
    el.style.zIndex = zIndex

    const flipH = item.flipH ? -1 : 1
    const transformStyle = flipH === -1 ? 'scaleX(-1)' : ''

    el.innerHTML = `
      <div class="furniture-inner-wrap" style="${transformStyle ? `transform: ${transformStyle};` : ''}">
        ${renderFurnitureResource(meta)}
      </div>
    `

    if (isSelected && state.isEditing) {
      const bubble = document.createElement('div')
      bubble.className = 'furniture-action-bubble'
      bubble.innerHTML = `
        <button type="button" class="btn-action-bubble bubble-flip" title="좌우 반전">↔️ 반전</button>
        <button type="button" class="btn-action-bubble bubble-remove" title="보관함으로">📦 보관</button>
        <button type="button" class="btn-action-bubble" title="선택 해제">✕</button>
      `
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
  const flipBtn = document.getElementById('btn-toolbar-flip')
  const removeBtn = document.getElementById('btn-toolbar-remove')

  if (toolbar) {
    toolbar.classList.toggle('is-editing', state.isEditing)
  }

  if (!state.isEditing) {
    if (statusEl) statusEl.innerHTML = ''
    if (flipBtn) flipBtn.disabled = true
    if (removeBtn) removeBtn.disabled = true
    return
  }

  if (state.selectedItemInstanceId) {
    const item = state.placedItems.find(i => i.id === state.selectedItemInstanceId)
    const meta = item ? FURNITURE_CATALOG.find(f => f.id === item.furniture_id) : null
    const flipText = item && item.flipH ? ' (↔️ 반전됨)' : ''
    if (statusEl) {
      statusEl.innerHTML = `✨ <strong>[${meta ? meta.name : '가구'}]</strong>${flipText}`
    }
    if (flipBtn) flipBtn.disabled = false
    if (removeBtn) removeBtn.disabled = false
  } else {
    if (statusEl) {
      statusEl.innerHTML = '🖐️ 가구를 터치하거나 드래그해 배치하세요'
    }
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

    const spanW = meta.baseW
    const spanH = meta.baseH

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

          highlightCandidate(clampedCol, clampedRow, isoDragCtx.meta)
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

function highlightCandidate(col, row, meta) {
  clearHighlights()
  const spanW = meta.baseW
  const spanH = meta.baseH

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

function applyDropItem(instanceId, col, row) {
  const itemIndex = state.placedItems.findIndex(i => i.id === instanceId)
  if (itemIndex === -1) return

  const item = state.placedItems[itemIndex]
  const meta = FURNITURE_CATALOG.find(f => f.id === item.furniture_id)
  if (!meta) return

  const spanW = meta.baseW
  const spanH = meta.baseH

  const clampedX = Math.max(0, Math.min(ISO_GRID.cols - spanW, col))
  const clampedY = Math.max(0, Math.min(ISO_GRID.rows - spanH, row))

  item.x = clampedX
  item.y = clampedY

  selectItem(instanceId)
  showToast(`가구가 (${clampedX + 1}, ${clampedY + 1}) 위치로 배치되었습니다 ✨`)
}

export function selectItem(instanceId) {
  state.selectedItemInstanceId = instanceId
  renderPlacedItems()
}

export function flipSelectedItem() {
  if (!state.selectedItemInstanceId) return
  const item = state.placedItems.find(i => i.id === state.selectedItemInstanceId)
  if (!item) return

  item.flipH = !item.flipH
  renderPlacedItems()
  showToast(item.flipH ? '가구를 좌우 반전했습니다 ↔️' : '가구 좌우 반전을 원래대로 돌렸습니다 ↔️')
}

export function removeSelectedItemToInventory() {
  if (!state.selectedItemInstanceId) return
  const itemIndex = state.placedItems.findIndex(i => i.id === state.selectedItemInstanceId)
  if (itemIndex === -1) return

  const item = state.placedItems[itemIndex]
  const meta = FURNITURE_CATALOG.find(f => f.id === item.furniture_id)

  state.placedItems.splice(itemIndex, 1)
  state.selectedItemInstanceId = null

  // 중복 아이템 방지: 이미 인벤토리에 없으면 추가
  if (!state.inventory.includes(item.furniture_id)) {
    state.inventory.push(item.furniture_id)
  }
  state.inventory = [...new Set(state.inventory)]
  localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(state.inventory))
  localStorage.setItem(STORAGE_KEY_PLACED, JSON.stringify(state.placedItems))

  renderPlacedItems()
  renderInventory()
  showToast(`[${meta ? meta.name : '가구'}]을(를) 보관함에 넣었습니다 📦`)
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

  if (countBadge) countBadge.innerText = state.inventory.length

  if (state.inventory.length === 0) {
    grid.innerHTML = `
      <div class="panel-empty-state panel-empty-full">
        <div class="panel-empty-icon">🎒</div>
        <div class="panel-empty-text">보관함이 비어있습니다.<br>상점에서 모던 가구와 배경을 둘러보세요!</div>
      </div>
    `
    return
  }

  // 보관함 필터링 (전체 / 가구 / 배경)
  let invItems = state.inventory.map((itemId, idx) => {
    const item = FURNITURE_CATALOG.find(f => f.id === itemId)
    return { item, idx, itemId }
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

  grid.innerHTML = invItems.map(({ item, idx, itemId }) => {
    const isBg = ['wallpaper', 'flooring', 'window'].includes(item.category)
    const isEquipped = isBg && state.roomTheme[item.category] === item.id

    let actionBtn = ''
    if (isBg) {
      if (isEquipped) {
        actionBtn = `<button type="button" class="btn-card-unequip" onclick="window.mineroom.unequipBackground('${item.category}')">장착 해제</button>`
      } else {
        actionBtn = `<button type="button" class="btn-card-equip" onclick="window.mineroom.equipBackground('${item.id}')">장착하기</button>`
      }
    } else {
      actionBtn = `<button type="button" class="btn-card-action btn-card-place" onclick="window.mineroom.placeFromInventory('${itemId}', ${idx})">방에 배치</button>`
    }

    const badgeLabel = isBg
      ? (item.category === 'wallpaper' ? '벽지' : item.category === 'flooring' ? '바닥재' : '창문')
      : `${item.baseW}x${item.baseH}`

    return `
      <div class="furniture-card inventory-card" data-inv-idx="${idx}" data-furniture-id="${item.id}" data-is-bg="${isBg}">
        <div class="furniture-card-thumb">
          <span class="card-size-badge">${badgeLabel}</span>
          ${isEquipped ? '<span class="card-equipped-tag">✓ 장착 중</span>' : ''}
          ${renderFurnitureResource(item)}
        </div>
        <div class="furniture-card-info">
          <h4 class="card-item-name">${item.name}</h4>
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
  if (!['wallpaper', 'flooring', 'window'].includes(category)) return

  state.roomTheme[category] = null
  localStorage.setItem(STORAGE_KEY_THEME, JSON.stringify(state.roomTheme))

  renderIsoScene()
  renderInventory()
  const catName = category === 'wallpaper' ? '벽지' : category === 'flooring' ? '바닥재' : '창문'
  showToast(`[${catName}] 장착을 해제하고 기본 스타일로 복귀했습니다.`, 'normal')
}

function attachInventoryCardDrag() {
  const cards = document.querySelectorAll('.inventory-card')
  cards.forEach(card => {
    // 배경 아이템은 방 캔버스 드래그 대상이 아니므로 이벤트 제외
    if (card.dataset.isBg === 'true') return

    let isDown = false
    let startX = 0
    let startY = 0
    let isDragging = false
    const itemId = card.dataset.furnitureId
    const invIdx = Number(card.dataset.invIdx)
    const meta = FURNITURE_CATALOG.find(f => f.id === itemId)

    card.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return

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
            placeAtCoordinates(itemId, invIdx, tile.col, tile.row)
            return
          }
        }
      }
    })
  })
}

function placeAtCoordinates(itemId, invIdx, col, row) {
  const meta = FURNITURE_CATALOG.find(f => f.id === itemId)
  if (!meta) return

  const clampedX = Math.max(0, Math.min(ISO_GRID.cols - meta.baseW, col))
  const clampedY = Math.max(0, Math.min(ISO_GRID.rows - meta.baseH, row))

  if (typeof invIdx === 'number' && invIdx >= 0) {
    state.inventory.splice(invIdx, 1)
  } else {
    const idx = state.inventory.indexOf(itemId)
    if (idx !== -1) state.inventory.splice(idx, 1)
  }

  const newInstanceId = `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`
  state.placedItems.push({
    id: newInstanceId,
    furniture_id: itemId,
    x: clampedX,
    y: clampedY,
    rotation: 0,
    flipH: false
  })

  localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(state.inventory))
  localStorage.setItem(STORAGE_KEY_PLACED, JSON.stringify(state.placedItems))

  if (!state.isEditing) {
    toggleEditMode(true)
  }
  selectItem(newInstanceId)

  renderPlacedItems()
  renderInventory()
  renderShopTab()
  showToast(`[${meta.name}]이(가) (${clampedX + 1}, ${clampedY + 1})에 배치되었습니다! ✨`)
}

export function placeFromInventory(itemId, invIndex) {
  const meta = FURNITURE_CATALOG.find(f => f.id === itemId)
  if (!meta) return

  let foundX = -1
  let foundY = -1

  for (let r = 0; r <= ISO_GRID.rows - meta.baseH; r++) {
    for (let c = 0; c <= ISO_GRID.cols - meta.baseW; c++) {
      const overlap = state.placedItems.some(placed => {
        const pMeta = FURNITURE_CATALOG.find(f => f.id === placed.furniture_id)
        if (!pMeta) return false
        const pW = pMeta.baseW
        const pH = pMeta.baseH

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

  placeAtCoordinates(itemId, invIndex, foundX, foundY)
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

  // 이미 보유(보관함에 있거나 방에 배치됨 또는 장착 중) 중인 아이템은 상점 리스트에서 완전 제외
  items = items.filter(item => {
    const isOwned = state.inventory.includes(item.id) ||
                    state.placedItems.some(p => p.furniture_id === item.id) ||
                    (['wallpaper', 'flooring', 'window'].includes(item.category) && state.roomTheme[item.category] === item.id)
    return !isOwned
  })

  if (items.length === 0) {
    const totalCatalogCount = FURNITURE_CATALOG.length
    const emptyMsg = totalCatalogCount === 0
      ? '등록된 아이템이 아직 없습니다.<br><a href="admin.html" style="display:inline-block; margin-top:8px; color:#8c6a50; font-weight:700; text-decoration:underline;">🛠️ 관리자 페이지에서 새 아이템 등록하기 ➔</a>'
      : '해당 카테고리의 모든 아이템을 보유 중입니다! 🎉'

    grid.innerHTML = `
      <div class="panel-empty-state panel-empty-full">
        <div class="panel-empty-icon">${totalCatalogCount === 0 ? '🛠️' : '🎉'}</div>
        <div class="panel-empty-text">${emptyMsg}</div>
      </div>
    `
    return
  }

  grid.innerHTML = items.map(item => {
    const isSpecial = item.special
    const isBg = ['wallpaper', 'flooring', 'window'].includes(item.category)

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
    if (isSpecial) {
      if (isUnlocked) {
        actionBtn = `<button type="button" class="btn-card-action btn-card-buy" onclick="window.mineroom.claimSpecialItem('${item.id}')">🎉 무료 수령</button>`
      } else {
        actionBtn = `<button type="button" class="btn-card-action" disabled title="${item.conditionDesc}">🔒 해금 필요</button>`
      }
    } else {
      actionBtn = `<button type="button" class="btn-card-action btn-card-buy" onclick="window.mineroom.buyItem('${item.id}')">구매하기</button>`
    }

    const badgeLabel = isBg
      ? (item.category === 'wallpaper' ? '벽지' : item.category === 'flooring' ? '바닥재' : '창문')
      : `${item.baseW}x${item.baseH}`

    return `
      <div class="furniture-card">
        <div class="furniture-card-thumb">
          <span class="card-size-badge">${badgeLabel}</span>
          ${isSpecial ? '<span class="card-special-badge">SPECIAL</span>' : ''}
          ${renderFurnitureResource(item)}
        </div>
        <div class="furniture-card-info">
          <h4 class="card-item-name">${item.name}</h4>
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

export function buyItem(itemId) {
  const item = FURNITURE_CATALOG.find(f => f.id === itemId)
  if (!item) return

  const isBg = ['wallpaper', 'flooring', 'window'].includes(item.category)

  // 중복 아이템 방지 (이미 보유중인 경우 1개만 유지)
  if (state.inventory.includes(itemId) ||
      state.placedItems.some(p => p.furniture_id === itemId) ||
      (isBg && state.roomTheme[item.category] === itemId)) {
    showToast(`[${item.name}]은(는) 이미 보유하고 있습니다!`, 'normal')
    return
  }

  if (state.roomPoints < item.price) {
    showToast(`포인트가 부족합니다! (현재: ${state.roomPoints.toLocaleString()}P / 필요: ${item.price}P)`, 'error')
    return
  }

  state.roomPoints -= item.price
  state.inventory.push(itemId)
  state.inventory = [...new Set(state.inventory)]

  // 배경 아이템인 경우 즉시 방에 자동 장착!
  if (isBg) {
    state.roomTheme[item.category] = itemId
    localStorage.setItem(STORAGE_KEY_THEME, JSON.stringify(state.roomTheme))
    renderIsoScene()
  }

  localStorage.setItem(STORAGE_KEY_POINTS, String(state.roomPoints))
  localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(state.inventory))

  renderHeaderStats()
  renderShopTab()
  renderInventory()

  if (isBg) {
    const catName = item.category === 'wallpaper' ? '벽지' : item.category === 'flooring' ? '바닥재' : '창문'
    showToast(`[${item.name}] ${catName}을(를) 구매하여 보관함에 담고 즉시 장착했습니다! ✨`, 'success')
  } else {
    showToast(`[${item.name}]을(를) 구매했습니다! 보관함에서 확인해보세요 🛍️`, 'success')
  }
}

export function claimSpecialItem(itemId) {
  const item = FURNITURE_CATALOG.find(f => f.id === itemId)
  if (!item) return

  if (state.inventory.includes(itemId) || state.placedItems.some(p => p.furniture_id === itemId)) {
    showToast('이미 보유하고 있는 특별 아이템입니다.')
    return
  }

  state.inventory.push(itemId)
  state.inventory = [...new Set(state.inventory)]
  localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(state.inventory))

  renderShopTab()
  renderInventory()
  showToast(`축하합니다! 특별 아이템 [${item.name}]을(를) 수령했습니다! 🏆✨`, 'success')
}

// ==========================================================================
// 9. Supabase 연동: 가구 배치 DB 완벽 저장 & 상태 복원
// ==========================================================================
export async function saveMineroomLayout() {
  try {
    localStorage.setItem(STORAGE_KEY_PLACED, JSON.stringify(state.placedItems))
  } catch (e) {
    console.error('로컬 백업 실패:', e)
  }

  const saveBtn = document.getElementById('btn-header-mode')
  if (saveBtn) {
    saveBtn.disabled = true
    saveBtn.innerHTML = '<span>저장 중...</span>'
  }

  try {
    const { error: delError } = await supabase
      .from('mineroom_placed')
      .delete()
      .neq('id', '__dummy_all__')

    if (delError) {
      if (delError.code === 'PGRST205') {
        throw new Error('TABLE_NOT_FOUND')
      }
      throw delError
    }

    if (state.placedItems.length > 0) {
      const recordsToInsertWithFlip = state.placedItems.map(item => ({
        id: item.id,
        furniture_id: item.furniture_id,
        x: item.x,
        y: item.y,
        rotation: item.rotation || 0,
        flip_h: Boolean(item.flipH),
        updated_at: new Date().toISOString()
      }))

      let { error: insError } = await supabase
        .from('mineroom_placed')
        .insert(recordsToInsertWithFlip)

      // DB 테이블에 flip_h 컬럼이 아직 없는 경우 안전한 Fallback 저장
      if (insError && (insError.message?.includes('flip_h') || insError.code === '42703' || insError.code === 'PGRST204')) {
        const recordsWithoutFlip = state.placedItems.map(item => ({
          id: item.id,
          furniture_id: item.furniture_id,
          x: item.x,
          y: item.y,
          rotation: item.rotation || 0,
          updated_at: new Date().toISOString()
        }))
        const retry = await supabase.from('mineroom_placed').insert(recordsWithoutFlip)
        insError = retry.error
      }

      if (insError) throw insError
    }

    state.isDbSynced = true
    updateDbSyncBadge()
    showToast('미니룸 배치가 Supabase DB에 완벽히 저장되었습니다! 💾✨', 'success')
  } catch (err) {
    console.warn('Supabase 저장 안내:', err.message)
    state.isDbSynced = false
    updateDbSyncBadge()

    showToast('배치가 안전하게 저장되었습니다!', 'success')
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false
    }
    // 저장 완료 후 둘러보기 모드로 자동 복귀
    toggleEditMode(false)
  }
}

export function clearAllPlacedItems() {
  if (state.placedItems.length === 0) {
    showToast('방에 배치된 가구가 없습니다.')
    return
  }
  if (!confirm('배치된 모든 가구를 보관함으로 옮기시겠습니까?')) return

  state.placedItems.forEach(item => {
    state.inventory.push(item.furniture_id)
  })
  state.inventory = [...new Set(state.inventory)]
  state.placedItems = []
  state.selectedItemInstanceId = null
  localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(state.inventory))
  localStorage.setItem(STORAGE_KEY_PLACED, JSON.stringify(state.placedItems))

  renderPlacedItems()
  renderInventory()
  showToast('모든 가구를 보관함으로 옮겼습니다 🧹')
}

// ==========================================================================
// 10. UI 모드 전환 및 인터랙션 컨트롤러
// ==========================================================================
function renderHeaderStats() {
  const ptEl = document.getElementById('stat-room-points')
  const assetEl = document.getElementById('stat-total-asset')
  const tierEl = document.getElementById('stat-room-tier')

  if (ptEl) ptEl.innerText = `${state.roomPoints.toLocaleString()}P`
  if (assetEl) assetEl.innerText = `${state.totalAsset.toLocaleString()}원`
  if (tierEl) {
    const curTier = getGridConfig()
    tierEl.innerText = `🏠 ${curTier.name} ▾`
  }
}

// 🏠 공간 평형대 확장 티어 모달
export function openTierModal() {
  const modal = document.getElementById('tier-modal')
  renderTierModal()
  if (modal) modal.classList.add('open')
}

export function closeTierModal() {
  const modal = document.getElementById('tier-modal')
  if (modal) modal.classList.remove('open')
}

export function renderTierModal() {
  const container = document.getElementById('tier-list-container')
  if (!container) return

  const tiers = Object.values(ROOM_TIERS)
  container.innerHTML = tiers.map(tier => {
    const isCurrent = state.currentTier === tier.id
    const assetEligible = state.totalAsset >= tier.minAsset
    const goalsEligible = state.achievedGoalsCount >= tier.minGoals
    const isUnlocked = assetEligible || goalsEligible || tier.minAsset === 0

    let condText = ''
    if (tier.minAsset === 0) {
      condText = '기본 제공 평형대'
    } else {
      condText = `해금 조건: 총자산 ${tier.minAsset.toLocaleString()}원 이상 또는 목표 ${tier.minGoals}개 달성 (현재: ${state.totalAsset.toLocaleString()}원 / ${state.achievedGoalsCount}개)`
    }

    let actionBtn = ''
    if (isCurrent) {
      actionBtn = `<button type="button" class="btn-tier-action is-current" disabled>✓ 현재 평형</button>`
    } else if (isUnlocked) {
      actionBtn = `<button type="button" class="btn-tier-action" onclick="window.mineroom.setRoomTier('${tier.id}')">이 평형대로 변경</button>`
    } else {
      actionBtn = `<button type="button" class="btn-tier-action" style="opacity: 0.5;" disabled>🔒 해금 필요</button>`
    }

    return `
      <div class="tier-card ${isCurrent ? 'is-active' : ''}">
        <div class="tier-card-info">
          <div class="tier-card-header">
            <span class="tier-card-title">${tier.name}</span>
            <span class="tier-badge-pill">${tier.badge}</span>
          </div>
          <div class="tier-card-desc">${tier.desc}</div>
          <div class="tier-card-condition ${isUnlocked ? 'unlocked' : ''}">
            ${isUnlocked ? '🔓 해금 완료' : '🔒 ' + condText}
          </div>
        </div>
        ${actionBtn}
      </div>
    `
  }).join('')
}

export function handleHeaderModeClick() {
  if (!state.isEditing) {
    toggleEditMode(true)
  } else {
    saveMineroomLayout()
  }
}

export function toggleEditMode(forceState) {
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

// 🏠 방 확장 티어 변경 함수
export function setRoomTier(tierId) {
  if (!ROOM_TIERS[tierId]) return
  state.currentTier = tierId
  localStorage.setItem(STORAGE_KEY_TIER, tierId)

  // 가구들이 새로운 그리드 경계를 벗어나지 않도록 클램프
  const config = ROOM_TIERS[tierId]
  state.placedItems.forEach(item => {
    const meta = FURNITURE_CATALOG.find(f => f.id === item.furniture_id)
    if (meta) {
      const spanW = meta.baseW
      const spanH = meta.baseH
      item.x = Math.min(item.x, config.cols - spanW)
      item.y = Math.min(item.y, config.rows - spanH)
    }
  })
  localStorage.setItem(STORAGE_KEY_PLACED, JSON.stringify(state.placedItems))

  renderIsoScene()
  renderPlacedItems()
  renderHeaderStats()
  renderTierModal()
  showToast(`방 평형대가 [${config.name}](${config.badge})으로 확장되었습니다! 🏠✨`, 'success')
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
  toggleEditMode,
  handleHeaderModeClick,
  selectItem,
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
  setRoomTier,
  openTierModal,
  closeTierModal,
  renderTierModal,
  openSqlModal,
  closeSqlModal,
  copySqlCode
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    await initMineroomData()
    await loadFinancialData()
  })
}
