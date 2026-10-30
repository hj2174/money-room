// js/admin.js
// 🛠️ 머니룸 가구 시스템 독립 관리자 센터 컨트롤러 (Supabase DB & 리소스 매니저)

import { supabase } from './supabaseClient.js'

// ==========================================================================
// 1. 관리자 상태 관리 (Admin State)
// ==========================================================================
export const STORAGE_KEY_CATALOG = 'moneyroom_furniture_catalog'

const adminState = {
  catalog: [], // 등록된 가구 카탈로그 마스터 목록
  activeFilter: 'all', // 카테고리 필터 ('all' | 'bed' | 'desk-chair' | 'sofa-rug' | 'decor-plant' | 'special')
  searchKeyword: '', // 검색 키워드
  editingId: null, // 현재 수정 중인 가구 ID (null이면 신규 등록 모드)
  activeResourceTab: 'file', // 리소스 입력 방식 ('file' | 'url' | 'svg')
  currentResource: {
    type: 'none', // 'file' | 'url' | 'svg' | 'none'
    data: '' // 이미지 DataURL 또는 외부 URL 또는 SVG 문자열
  }
}

// ==========================================================================
// 2. 가구 카탈로그 데이터 로드 & Supabase DB 연동
// ==========================================================================
export async function loadCatalogData() {
  let loadedFromDb = false
  try {
    const { data, error } = await supabase
      .from('furniture_catalog')
      .select('*')
      .order('created_at', { ascending: true })

    if (!error && Array.isArray(data)) {
      adminState.catalog = data.map(mapDbToAdminItem)
      localStorage.setItem(STORAGE_KEY_CATALOG, JSON.stringify(adminState.catalog))
      loadedFromDb = true
    } else if (error) {
      console.warn('Supabase 가구 카탈로그 조회 알림:', error.message)
    }
  } catch (err) {
    console.warn('Supabase 가구 카탈로그 조회 대기 (로컬 폴백):', err.message)
  }

  if (!loadedFromDb) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CATALOG)
      if (saved) {
        adminState.catalog = JSON.parse(saved)
      } else {
        adminState.catalog = []
      }
    } catch (e) {
      console.warn('로컬 가구 카탈로그 로드 실패:', e)
      adminState.catalog = []
    }
  }

  renderCatalogList()
  updateStatsBadge()
}

function mapDbToAdminItem(row) {
  return {
    id: String(row.id),
    name: row.name || '이름 없는 가구',
    category: row.category || 'decor-plant',
    baseW: Number(row.base_w) || 1,
    baseH: Number(row.base_h) || 1,
    price: Number(row.price) || 0,
    desc: row.description || '',
    special: Boolean(row.is_special),
    conditionType: row.condition_type || 'goal_count',
    conditionValue: Number(row.condition_value) || 0,
    conditionDesc: row.condition_desc || '',
    imageUrl: row.image_url || '',
    svgData: row.svg_data || ''
  }
}

// ==========================================================================
// 3. 실시간 2.5D 그리드 핏 시뮬레이터 (Live Preview)
// ==========================================================================
export function updateLivePreview() {
  const svg = document.getElementById('preview-stage-svg')
  if (!svg) return

  const baseW = Math.max(1, Math.min(4, Number(document.getElementById('furn-base-w')?.value) || 1))
  const baseH = Math.max(1, Math.min(4, Number(document.getElementById('furn-base-h')?.value) || 1))
  const category = document.getElementById('furn-category')?.value || 'decor-plant'

  const gridBadge = document.getElementById('preview-grid-badge')
  const isBg = ['wallpaper', 'flooring', 'window'].includes(category)

  if (isBg) {
    if (gridBadge) {
      gridBadge.innerText = category === 'wallpaper' ? '🖼️ 벽지 스킨 (방 전체)' : category === 'flooring' ? '🪵 바닥재 스킨 (방 전체)' : '🪟 창문 스킨 (벽면)'
    }

    const res = adminState.currentResource
    let bgPreviewHtml = `
      <!-- 좌측 벽면 -->
      <polygon points="30,130 140,185 140,55 30,0" fill="${category === 'wallpaper' ? '#dfd9cd' : '#f0ece3'}"/>
      <!-- 우측 벽면 -->
      <polygon points="140,185 250,130 250,0 140,55" fill="${category === 'wallpaper' ? '#cac1b3' : '#ded8cc'}"/>
      <!-- 바닥 마름모 타일 평면 -->
      <polygon points="30,130 140,185 250,130 140,75" fill="${category === 'flooring' ? '#e8ded3' : '#fdfbf8'}" stroke="#dcd4c8" stroke-width="1"/>
      <line x1="140" y1="55" x2="140" y2="185" stroke="#2c241d" stroke-opacity="0.2" stroke-width="1.5"/>
    `

    if (category === 'window') {
      bgPreviewHtml += `
        <!-- 창문 영역 (좌측 벽면) -->
        <polygon points="65,115 105,135 105,75 65,55" fill="#e8f3fa" stroke="#36322d" stroke-width="2"/>
        <line x1="85" y1="95" x2="85" y2="125" stroke="#36322d" stroke-width="1.2"/>
        <line x1="65" y1="85" x2="105" y2="105" stroke="#36322d" stroke-width="1.2"/>
      `
    }

    let resEl = ''
    if (res.type === 'file' || res.type === 'url') {
      if (res.data) {
        if (category === 'wallpaper') {
          resEl = `<image href="${res.data}" x="30" y="20" width="220" height="150" preserveAspectRatio="xMidYMid meet" opacity="0.9" />`
        } else if (category === 'flooring') {
          resEl = `<image href="${res.data}" x="50" y="85" width="180" height="90" preserveAspectRatio="xMidYMid meet" opacity="0.9" />`
        } else if (category === 'window') {
          resEl = `<image href="${res.data}" x="60" y="55" width="50" height="75" preserveAspectRatio="xMidYMid meet" />`
        }
      }
    } else if (res.type === 'svg') {
      if (res.data) {
        resEl = `
          <foreignObject x="40" y="30" width="200" height="130">
            <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
              ${res.data}
            </div>
          </foreignObject>
        `
      }
    }

    svg.innerHTML = `
      <defs>
        <filter id="previewShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="4"/>
          <feOffset dx="0" dy="4"/>
          <feComponentTransfer><feFuncA type="linear" slope="0.12"/></feComponentTransfer>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      ${bgPreviewHtml}
      ${resEl}
    `
    return
  }

  if (gridBadge) {
    gridBadge.innerText = `${baseW}x${baseH} 격자 타일`
  }

  // 2.5D 아이소메트릭 사선 그리드 기하학 파라미터 (미니 캔버스용)
  const tileW = 48
  const tileH = 24
  const halfW = tileW / 2
  const halfH = tileH / 2
  const originX = 140
  const originY = 60

  // 점유 마름모 4개 꼭짓점
  const topX = originX
  const topY = originY
  const rightX = originX + baseW * halfW
  const rightY = originY + baseW * halfH
  const bottomX = originX + (baseW - baseH) * halfW
  const bottomY = originY + (baseW + baseH) * halfH
  const leftX = originX - baseH * halfW
  const leftY = originY + baseH * halfH

  const centerX = (topX + bottomX) / 2
  const centerY = (topY + bottomY) / 2
  const diamondPoints = `${topX},${topY} ${rightX},${rightY} ${bottomX},${bottomY} ${leftX},${leftY}`

  // 바닥 격자 서브 타일 렌더링
  let tilesHtml = ''
  for (let r = 0; r < baseH; r++) {
    for (let c = 0; c < baseW; c++) {
      const tTopX = originX + (c - r) * halfW
      const tTopY = originY + (c + r) * halfH
      const tRightX = tTopX + halfW
      const tRightY = tTopY + halfH
      const tBottomX = tTopX
      const tBottomY = tTopY + tileH
      const tLeftX = tTopX - halfW
      const tLeftY = tTopY + halfH
      const pts = `${tTopX},${tTopY} ${tRightX},${tRightY} ${tBottomX},${tBottomY} ${tLeftX},${tLeftY}`
      const isEven = (r + c) % 2 === 0
      tilesHtml += `<polygon points="${pts}" fill="${isEven ? '#f4eee4' : '#ebe2d5'}" stroke="#d9cdbc" stroke-width="0.8"/>`
    }
  }

  // 가구 리소스 요소 생성
  let resourceSvgElement = ''
  const res = adminState.currentResource
  const isRug = category === 'sofa-rug' && baseW >= 2 && baseH >= 2

  let furnW, furnH, anchorY
  if (isRug) {
    furnW = (rightX - leftX) * 1.05
    furnH = (bottomY - topY) * 1.25
    anchorY = (bottomY - topY) * 0.55
  } else if (baseW >= 2 && baseH >= 2) {
    furnW = (rightX - leftX) * 1.05
    furnH = (bottomY - topY) * 1.85
    anchorY = (bottomY - topY) * 1.15
  } else if (baseW >= 2 || baseH >= 2) {
    furnW = Math.max((rightX - leftX) * 1.02, 90)
    furnH = Math.max((bottomY - topY) * 1.7, 74)
    anchorY = (bottomY - topY) * 1.05
  } else {
    furnW = 68
    furnH = 68
    anchorY = 48
  }

  const furnLeft = centerX - furnW / 2
  const furnTop = centerY - anchorY

  if (res.type === 'file' || res.type === 'url') {
    if (res.data) {
      resourceSvgElement = `
        <image href="${res.data}" x="${furnLeft}" y="${furnTop}" width="${furnW}" height="${furnH}" preserveAspectRatio="xMidYMid meet" />
      `
    }
  } else if (res.type === 'svg') {
    if (res.data) {
      resourceSvgElement = `
        <foreignObject x="${furnLeft}" y="${furnTop}" width="${furnW}" height="${furnH}">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
            ${res.data}
          </div>
        </foreignObject>
      `
    }
  }

  if (!resourceSvgElement) {
    // 리소스가 없을 때 기본 클레이 큐브 플레이스홀더
    const icon = category === 'bed' ? '🛏️'
               : category === 'desk-chair' ? '🪑'
               : category === 'sofa-rug' ? '🛋️'
               : category === 'special' ? '🏆'
               : '🪴'

    resourceSvgElement = `
      <g transform="translate(${centerX}, ${centerY - 18})">
        <circle cx="0" cy="0" r="22" fill="#e8dfd1" stroke="#bfae9e" stroke-width="1.5"/>
        <text x="0" y="7" font-size="20" text-anchor="middle">${icon}</text>
      </g>
    `
  }

  svg.innerHTML = `
    <defs>
      <filter id="previewShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
        <feOffset dx="0" dy="4"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.12"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <!-- 1. 바닥 앰비언트 그림자 -->
    <polygon points="${diamondPoints}" fill="#332a22" fill-opacity="0.1" filter="url(#previewShadow)"/>

    <!-- 2. 점유 그리드 서브 타일들 -->
    <g>${tilesHtml}</g>

    <!-- 3. 초록색 점선 풋프린트 외곽 가이드 -->
    <polygon points="${diamondPoints}" fill="rgba(46, 125, 86, 0.12)" stroke="#2e7d56" stroke-width="1.8" stroke-dasharray="4 3"/>

    <!-- 4. 가구 그래픽 리소스 안착 -->
    ${resourceSvgElement}

    <!-- 5. 중심 앵커 핀 포인트 -->
    <circle cx="${centerX}" cy="${centerY}" r="2" fill="#2e7d56"/>
  `
}

// ==========================================================================
// 4. 리소스 탭 & 파일 드래그앤드롭 / URL / SVG 입력 처리
// ==========================================================================
export function setResourceTab(tabName) {
  adminState.activeResourceTab = tabName
  document.querySelectorAll('.res-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.restab === tabName)
  })
  document.querySelectorAll('.res-tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `res-pane-${tabName}`)
  })
}

export function handleFileSelect(file) {
  if (!file) return

  const fileInfoBar = document.getElementById('file-info-bar')
  const fileInfoName = document.getElementById('file-info-name')

  if (fileInfoBar && fileInfoName) {
    fileInfoName.innerText = `선택된 파일: ${file.name} (${Math.round(file.size / 1024)} KB)`
    fileInfoBar.style.display = 'flex'
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    const dataUrl = e.target.result
    adminState.currentResource = {
      type: 'file',
      data: dataUrl,
      fileName: file.name,
      fileObject: file
    }
    updateLivePreview()
    showToast(`'${file.name}' 이미지가 로드되었습니다! ✨`, 'success')
  }
  reader.readAsDataURL(file)
}

export function clearFileResource() {
  const fileInput = document.getElementById('furn-file-input')
  const fileInfoBar = document.getElementById('file-info-bar')
  if (fileInput) fileInput.value = ''
  if (fileInfoBar) fileInfoBar.style.display = 'none'

  if (adminState.currentResource.type === 'file') {
    adminState.currentResource = { type: 'none', data: '' }
    updateLivePreview()
  }
}

export function handleUrlInput(url) {
  adminState.currentResource = {
    type: url.trim() ? 'url' : 'none',
    data: url.trim()
  }
  updateLivePreview()
}

export function handleSvgInput(svgCode) {
  adminState.currentResource = {
    type: svgCode.trim() ? 'svg' : 'none',
    data: svgCode.trim()
  }
  updateLivePreview()
}

// 드래그 앤 드롭 존 이벤트 초기화
function initDropzone() {
  const dropzone = document.getElementById('admin-dropzone')
  if (!dropzone) return

  ;['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault()
      e.stopPropagation()
    }, false)
  })

  ;['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => {
      dropzone.classList.add('dragover')
    }, false)
  })

  ;['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => {
      dropzone.classList.remove('dragover')
    }, false)
  })

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer
    const files = dt.files
    if (files && files.length > 0) {
      handleFileSelect(files[0])
    }
  }, false)
}

// ==========================================================================
// 5. 폼 인터랙션 (프리셋, 카테고리, ID 생성, 스페셜 토글)
// ==========================================================================
export function setGridPreset(w, h) {
  const wInput = document.getElementById('furn-base-w')
  const hInput = document.getElementById('furn-base-h')
  if (wInput) wInput.value = w
  if (hInput) hInput.value = h

  document.querySelectorAll('.preset-chip').forEach(chip => {
    const cw = Number(chip.dataset.w)
    const ch = Number(chip.dataset.h)
    chip.classList.toggle('active', cw === w && ch === h)
  })

  updateLivePreview()
}

export function handleCategoryChange(cat) {
  const isSpecial = cat === 'special'
  const specialCheck = document.getElementById('furn-is-special')
  if (specialCheck) {
    specialCheck.checked = isSpecial
    toggleSpecialFields(isSpecial)
  }

  // 카테고리 변경 시 권장 프리셋 자동 안내
  if (cat === 'bed') {
    setGridPreset(2, 2)
  } else if (cat === 'desk-chair' || cat === 'sofa-rug') {
    setGridPreset(2, 1)
  } else {
    setGridPreset(1, 1)
  }

  updateLivePreview()
}

export function toggleSpecialFields(show) {
  const panel = document.getElementById('special-options-panel')
  if (panel) {
    panel.style.display = show ? 'flex' : 'none'
  }
}

export function generateRandomId() {
  const cat = document.getElementById('furn-category')?.value || 'item'
  const randomSuffix = Math.random().toString(36).substring(2, 6)
  const newId = `${cat.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now().toString(36)}_${randomSuffix}`
  const idInput = document.getElementById('furn-id')
  if (idInput) idInput.value = newId
}

// ==========================================================================
// 6. 가구 등록 및 수정 (Supabase DB 'furniture_catalog' 저장)
// ==========================================================================
export async function handleFormSubmit(e) {
  e.preventDefault()

  const id = document.getElementById('furn-id')?.value.trim()
  const name = document.getElementById('furn-name')?.value.trim()
  const category = document.getElementById('furn-category')?.value || 'decor-plant'
  const price = Number(document.getElementById('furn-price')?.value) || 0
  const baseW = Math.max(1, Math.min(4, Number(document.getElementById('furn-base-w')?.value) || 1))
  const baseH = Math.max(1, Math.min(4, Number(document.getElementById('furn-base-h')?.value) || 1))
  const desc = document.getElementById('furn-desc')?.value.trim() || ''
  const isSpecial = Boolean(document.getElementById('furn-is-special')?.checked)
  const conditionType = isSpecial ? (document.getElementById('furn-cond-type')?.value || 'goal_count') : null
  const conditionValue = isSpecial ? (Number(document.getElementById('furn-cond-val')?.value) || 0) : 0
  const conditionDesc = isSpecial ? (document.getElementById('furn-cond-desc')?.value.trim() || '') : ''

  if (!id || !name) {
    showToast('가구 식별자 ID와 이름을 입력해주세요.', 'error')
    return
  }

  let imageUrl = ''
  let svgData = ''

  if (adminState.currentResource.type === 'file' || adminState.currentResource.type === 'url') {
    imageUrl = adminState.currentResource.data
  } else if (adminState.currentResource.type === 'svg') {
    svgData = adminState.currentResource.data
  }

  // Supabase DB에 저장할 레코드 규격
  const record = {
    id,
    name,
    category,
    base_w: baseW,
    base_h: baseH,
    price,
    description: desc,
    image_url: imageUrl,
    svg_data: svgData,
    is_special: isSpecial,
    condition_type: conditionType,
    condition_value: conditionValue,
    condition_desc: conditionDesc
  }

  const submitBtn = document.getElementById('btn-submit-form')
  if (submitBtn) {
    submitBtn.disabled = true
    submitBtn.innerText = '저장 중... ⏳'
  }

  let dbSaved = false
  try {
    const { error } = await supabase.from('furniture_catalog').upsert(record)
    if (!error) {
      dbSaved = true
    } else {
      console.warn('Supabase 저장 알림:', error.message)
    }
  } catch (err) {
    console.warn('Supabase 저장 대기 (로컬 저장):', err.message)
  }

  // 로컬 스토리지 동기화
  const mappedItem = mapDbToAdminItem(record)
  const existingIdx = adminState.catalog.findIndex(i => i.id === id)
  if (existingIdx !== -1) {
    adminState.catalog[existingIdx] = mappedItem
  } else {
    adminState.catalog.push(mappedItem)
  }
  localStorage.setItem(STORAGE_KEY_CATALOG, JSON.stringify(adminState.catalog))

  if (submitBtn) {
    submitBtn.disabled = false
    submitBtn.innerText = '➕ 가구 카탈로그에 등록'
  }

  resetForm()
  renderCatalogList()
  updateStatsBadge()

  const toastMsg = dbSaved 
    ? `[${name}] 가구가 Supabase DB 및 카탈로그에 성공적으로 등록되었습니다! 🎉`
    : `[${name}] 가구가 로컬 카탈로그에 등록되었습니다 (DB 연동 준비중) ✨`
  showToast(toastMsg, 'success')
}

// 폼 초기화 (신규 등록 모드로 리셋)
export function resetForm() {
  adminState.editingId = null
  adminState.currentResource = { type: 'none', data: '' }

  const form = document.getElementById('furniture-form')
  if (form) form.reset()

  const idInput = document.getElementById('furn-id')
  if (idInput) {
    idInput.disabled = false
    generateRandomId()
  }

  const modeBadge = document.getElementById('form-mode-badge')
  if (modeBadge) {
    modeBadge.className = 'form-mode-badge'
    modeBadge.innerText = '✨ 신규 가구 등록'
  }

  const titleEl = document.getElementById('form-card-title')
  if (titleEl) titleEl.innerText = '새 가구 아이템 등록'

  const submitBtn = document.getElementById('btn-submit-form')
  if (submitBtn) submitBtn.innerText = '➕ 가구 카탈로그에 등록'

  toggleSpecialFields(false)
  setResourceTab('file')
  clearFileResource()
  setGridPreset(1, 1)
  updateLivePreview()
}

// 가구 수정 모드로 폼에 데이터 로드
export function editFurniture(id) {
  const item = adminState.catalog.find(i => i.id === id)
  if (!item) return

  adminState.editingId = id

  const idInput = document.getElementById('furn-id')
  if (idInput) {
    idInput.value = item.id
    idInput.disabled = true // 수정 모드에서는 PK 변경 불가
  }

  const nameInput = document.getElementById('furn-name')
  if (nameInput) nameInput.value = item.name

  const catSelect = document.getElementById('furn-category')
  if (catSelect) catSelect.value = item.category

  const priceInput = document.getElementById('furn-price')
  if (priceInput) priceInput.value = item.price

  const descText = document.getElementById('furn-desc')
  if (descText) descText.value = item.desc || ''

  setGridPreset(item.baseW, item.baseH)

  const specialCheck = document.getElementById('furn-is-special')
  if (specialCheck) {
    specialCheck.checked = item.special
    toggleSpecialFields(item.special)
  }

  const condType = document.getElementById('furn-cond-type')
  if (condType && item.conditionType) condType.value = item.conditionType

  const condVal = document.getElementById('furn-cond-val')
  if (condVal) condVal.value = item.conditionValue || 0

  const condDesc = document.getElementById('furn-cond-desc')
  if (condDesc) condDesc.value = item.conditionDesc || ''

  // 리소스 복원
  if (item.imageUrl) {
    if (item.imageUrl.startsWith('data:')) {
      adminState.currentResource = { type: 'file', data: item.imageUrl }
      setResourceTab('file')
      const fileInfoBar = document.getElementById('file-info-bar')
      const fileInfoName = document.getElementById('file-info-name')
      if (fileInfoBar && fileInfoName) {
        fileInfoName.innerText = '기존 저장된 이미지 리소스'
        fileInfoBar.style.display = 'flex'
      }
    } else {
      adminState.currentResource = { type: 'url', data: item.imageUrl }
      setResourceTab('url')
      const urlInput = document.getElementById('furn-image-url')
      if (urlInput) urlInput.value = item.imageUrl
    }
  } else if (item.svgData) {
    adminState.currentResource = { type: 'svg', data: item.svgData }
    setResourceTab('svg')
    const svgArea = document.getElementById('furn-svg-data')
    if (svgArea) svgArea.value = item.svgData
  } else {
    adminState.currentResource = { type: 'none', data: '' }
    setResourceTab('file')
  }

  const modeBadge = document.getElementById('form-mode-badge')
  if (modeBadge) {
    modeBadge.className = 'form-mode-badge is-edit'
    modeBadge.innerText = '✏️ 가구 수정 모드'
  }

  const titleEl = document.getElementById('form-card-title')
  if (titleEl) titleEl.innerText = `가구 수정: [${item.name}]`

  const submitBtn = document.getElementById('btn-submit-form')
  if (submitBtn) submitBtn.innerText = '✏️ 가구 정보 업데이트'

  updateLivePreview()

  // 폼으로 스크롤 이동
  window.scrollTo({ top: 0, behavior: 'smooth' })
  showToast(`[${item.name}] 정보를 폼에 불러왔습니다. 수정 후 저장하세요.`, 'normal')
}

// 가구 삭제
export async function deleteFurniture(id) {
  const item = adminState.catalog.find(i => i.id === id)
  const itemName = item ? item.name : id

  if (!confirm(`정말로 가구 [${itemName}]을(를) 카탈로그에서 삭제하시겠습니까?`)) {
    return
  }

  try {
    await supabase.from('furniture_catalog').delete().eq('id', id)
  } catch (err) {
    console.warn('Supabase 삭제 대기:', err.message)
  }

  adminState.catalog = adminState.catalog.filter(i => i.id !== id)
  localStorage.setItem(STORAGE_KEY_CATALOG, JSON.stringify(adminState.catalog))

  if (adminState.editingId === id) {
    resetForm()
  }

  renderCatalogList()
  updateStatsBadge()
  showToast(`[${itemName}] 가구를 삭제했습니다.`, 'normal')
}

// ==========================================================================
// 7. 카탈로그 목록 렌더링 & 검색/필터
// ==========================================================================
export function setListFilter(cat) {
  adminState.activeFilter = cat
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.cat === cat)
  })
  renderCatalogList()
}

export function handleSearch(keyword) {
  adminState.searchKeyword = keyword.trim().toLowerCase()
  renderCatalogList()
}

export function renderCatalogList() {
  const grid = document.getElementById('admin-catalog-grid')
  if (!grid) return

  let items = adminState.catalog

  // 카테고리 필터
  if (adminState.activeFilter !== 'all') {
    if (adminState.activeFilter === 'special') {
      items = items.filter(i => i.special === true)
    } else if (adminState.activeFilter === 'background') {
      items = items.filter(i => ['wallpaper', 'flooring', 'window'].includes(i.category))
    } else {
      items = items.filter(i => i.category === adminState.activeFilter && !i.special)
    }
  }

  // 키워드 검색
  if (adminState.searchKeyword) {
    items = items.filter(i => 
      i.name.toLowerCase().includes(adminState.searchKeyword) ||
      i.id.toLowerCase().includes(adminState.searchKeyword) ||
      (i.desc && i.desc.toLowerCase().includes(adminState.searchKeyword))
    )
  }

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="admin-empty-state">
        <div class="admin-empty-icon">🛋️</div>
        <h3 class="admin-empty-title">등록된 가구가 없습니다</h3>
        <p class="admin-empty-desc">왼쪽 등록 폼에서 새로운 가구를 등록하거나, 상단의 [📦 기본 샘플 세트 생성] 버튼을 눌러보세요!</p>
        <button type="button" class="btn-admin-action btn-seed-samples" onclick="window.adminStudio.seedSampleFurniture()">
          <span>📦 기본 샘플 8종 가구/배경 즉시 생성</span>
        </button>
      </div>
    `
    return
  }

  grid.innerHTML = items.map(item => {
    let thumbHtml = ''
    if (item.imageUrl) {
      thumbHtml = `<img src="${item.imageUrl}" alt="${item.name}" draggable="false" />`
    } else if (item.svgData) {
      thumbHtml = item.svgData
    } else {
      const icon = item.category === 'bed' ? '🛏️'
                 : item.category === 'desk-chair' ? '🪑'
                 : item.category === 'sofa-rug' ? '🛋️'
                 : item.category === 'wallpaper' ? '🖼️'
                 : item.category === 'flooring' ? '🪵'
                 : item.category === 'window' ? '🪟'
                 : item.category === 'special' ? '🏆'
                 : '🪴'
      thumbHtml = `<span style="font-size: 36px;">${icon}</span>`
    }

    const isBg = ['wallpaper', 'flooring', 'window'].includes(item.category)
    const categoryLabel = item.category === 'bed' ? '침대'
                        : item.category === 'desk-chair' ? '데스크/체어'
                        : item.category === 'sofa-rug' ? '소파/러그'
                        : item.category === 'wallpaper' ? '배경 - 벽지'
                        : item.category === 'flooring' ? '배경 - 바닥재'
                        : item.category === 'window' ? '배경 - 창문'
                        : item.category === 'special' ? '스페셜 해금'
                        : '소품/플랜트'

    const sizeLabel = isBg ? '배경' : `${item.baseW}x${item.baseH}`

    return `
      <div class="admin-item-card">
        <div class="admin-thumb-wrap">
          <span class="card-size-tag">${sizeLabel}</span>
          ${item.special ? '<span class="card-special-tag">SPECIAL</span>' : ''}
          ${thumbHtml}
        </div>
        <div class="admin-card-body">
          <h4 class="admin-card-name">${item.name}</h4>
          <span class="admin-card-category">${categoryLabel} · ID: ${item.id}</span>
          <div class="admin-card-desc-text">${item.desc || '설명 없음'}</div>
        </div>
        <div class="admin-card-price-row">
          <span class="admin-price-badge">${item.special ? '🎉 무료 해금' : `🪙 ${item.price}P`}</span>
          <div class="admin-card-actions">
            <button type="button" class="btn-card-edit" onclick="window.adminStudio.editFurniture('${item.id}')">수정</button>
            <button type="button" class="btn-card-del" onclick="window.adminStudio.deleteFurniture('${item.id}')">삭제</button>
          </div>
        </div>
      </div>
    `
  }).join('')
}

function updateStatsBadge() {
  const countBadge = document.getElementById('catalog-count-badge')
  if (countBadge) {
    countBadge.innerText = `총 ${adminState.catalog.length}개 등록됨`
  }

  const total = adminState.catalog.length
  const bedCount = adminState.catalog.filter(i => i.category === 'bed' && !i.special).length
  const deskCount = adminState.catalog.filter(i => i.category === 'desk-chair' && !i.special).length
  const sofaCount = adminState.catalog.filter(i => i.category === 'sofa-rug' && !i.special).length
  const decorCount = adminState.catalog.filter(i => i.category === 'decor-plant' && !i.special).length
  const bgCount = adminState.catalog.filter(i => ['wallpaper', 'flooring', 'window'].includes(i.category)).length
  const specialCount = adminState.catalog.filter(i => i.special === true).length

  const setTxt = (id, val) => {
    const el = document.getElementById(id)
    if (el) el.innerText = val
  }
  setTxt('cat-count-all', total)
  setTxt('cat-count-bed', bedCount)
  setTxt('cat-count-desk', deskCount)
  setTxt('cat-count-sofa', sofaCount)
  setTxt('cat-count-decor', decorCount)
  setTxt('cat-count-bg', bgCount)
  setTxt('cat-count-special', specialCount)
}

// ==========================================================================
// 8. 테스트용 기본 샘플 가구 세트 생성 유틸리티
// ==========================================================================
export async function seedSampleFurniture() {
  const sampleItems = [
    {
      id: 'bed_sample_nordic',
      name: '북유럽 원목 로우 베드',
      category: 'bed',
      base_w: 2,
      base_h: 2,
      price: 0,
      description: '소프트 매트 원목 프레임과 웜 그레이 린넨 침구가 조화를 이루는 아늑한 2x2 더블 베드.',
      is_special: false,
      svg_data: `
        <svg viewBox="0 0 140 115" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="16,70 70,97 124,70 70,43" fill="#9a816c"/>
          <polygon points="16,70 70,97 70,105 16,78" fill="#6e5644"/>
          <polygon points="70,97 124,70 124,78 70,105" fill="#554131"/>
          <polygon points="16,68 70,41 70,12 16,39" fill="#9a816c"/>
          <polygon points="16,39 20,37 74,10 70,12" fill="#ab937e"/>
          <polygon points="70,41 124,68 120,70 66,43" fill="#554131"/>
          <polygon points="24,66 70,89 116,66 70,43" fill="#ffffff"/>
          <polygon points="34,56 46,50 56,55 44,61" fill="#ffffff"/>
          <polygon points="48,49 60,43 70,48 58,54" fill="#ffffff"/>
          <polygon points="30,66 70,86 112,65 72,45" fill="#fdfbf8"/>
          <polygon points="50,76 70,86 98,72 78,62" fill="#3d6353"/>
        </svg>
      `
    },
    {
      id: 'sofa_sample_cozy',
      name: '모던 그레이 1인 소파',
      category: 'sofa-rug',
      base_w: 2,
      base_h: 1,
      price: 0,
      description: '연한 그레이 패브릭 시트와 딥 차콜 쿠션, 내추럴 오크 다리가 어우러진 3D 미니어처 소파.',
      is_special: false,
      svg_data: `
        <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="20" y1="62" x2="20" y2="76" stroke="#8c735d" stroke-width="3" stroke-linecap="round"/>
          <line x1="60" y1="82" x2="60" y2="94" stroke="#8c735d" stroke-width="3" stroke-linecap="round"/>
          <line x1="100" y1="62" x2="100" y2="74" stroke="#705c4a" stroke-width="3" stroke-linecap="round"/>
          <polygon points="20,54 60,74 100,54 60,34" fill="#eae6df"/>
          <polygon points="20,54 60,74 60,65 20,45" fill="#c4bdb2"/>
          <polygon points="60,74 100,54 100,45 60,65" fill="#a8a194"/>
          <polygon points="20,50 60,30 60,8 20,28" fill="#c4bdb2"/>
          <polygon points="40,43 55,35 62,42 47,50" fill="#484f58"/>
        </svg>
      `
    },
    {
      id: 'table_sample_round',
      name: '원형 오크 티 테이블',
      category: 'desk-chair',
      base_w: 1,
      base_h: 1,
      price: 0,
      description: '부드러운 라운드 상판과 내추럴 오크 다리가 편안한 티 테이블.',
      is_special: false,
      svg_data: `
        <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="26" y1="46" x2="22" y2="68" stroke="#8a735c" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="40" y1="52" x2="40" y2="74" stroke="#8a735c" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="54" y1="46" x2="58" y2="68" stroke="#715d48" stroke-width="2.5" stroke-linecap="round"/>
          <ellipse cx="40" cy="42" rx="24" ry="13" fill="#ded8cc"/>
          <ellipse cx="40" cy="39" rx="24" ry="13" fill="#ffffff"/>
          <ellipse cx="42" cy="36" rx="4" ry="2.2" fill="#7d9885"/>
        </svg>
      `
    },
    {
      id: 'plant_sample_monstera',
      name: '싱그러운 몬스테라 화분',
      category: 'decor-plant',
      base_w: 1,
      base_h: 1,
      price: 0,
      description: '싱그러운 잎맥의 몬스테라와 따뜻한 베이지 시멘트 화분.',
      is_special: false,
      svg_data: `
        <svg viewBox="0 0 80 95" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="40" cy="62" rx="15" ry="8" fill="#9e9587"/>
          <path d="M 25,62 L 29,82 Q 40,88 51,82 L 55,62 Z" fill="#ede7de"/>
          <line x1="40" y1="62" x2="28" y2="34" stroke="#2d523e" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="40" y1="62" x2="44" y2="25" stroke="#2d523e" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="40" y1="62" x2="56" y2="38" stroke="#2d523e" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M 28,34 C 18,28 14,18 24,12 C 34,18 36,28 28,34 Z" fill="#4e7d62"/>
          <path d="M 44,25 C 36,15 38,6 48,6 C 58,10 54,20 44,25 Z" fill="#4e7d62"/>
          <path d="M 56,38 C 66,30 70,20 62,15 C 50,22 50,32 56,38 Z" fill="#3c654e"/>
        </svg>
      `
    },
    {
      id: 'rug_sample_modern',
      name: '모던 차콜 패브릭 러그',
      category: 'sofa-rug',
      base_w: 2,
      base_h: 2,
      price: 0,
      description: '차분한 차콜 톤에 모던한 사선 스티치 라인이 돋보이는 2x2 패브릭 러그.',
      is_special: false,
      svg_data: `
        <svg viewBox="0 0 130 90" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="65,15 116,42 65,69 14,42" fill="#464c54"/>
          <polygon points="65,19 110,42 65,65 20,42" stroke="#636b75" stroke-width="1.2" stroke-dasharray="4 2" fill="none"/>
        </svg>
      `
    },
    {
      id: 'wallpaper_sample_warmgray',
      name: '내추럴 웜그레이 벽지',
      category: 'wallpaper',
      base_w: 1,
      base_h: 1,
      price: 0,
      description: '소프트하고 차분한 모던 웜그레이 톤 3D 벽체 스킨.',
      is_special: false,
      svg_data: `
        <svg viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="10,64 50,76 50,14 10,2" fill="#dfd9cd"/>
          <polygon points="10,64 50,76 50,71 10,59" fill="#947861"/>
          <polygon points="50,76 90,64 90,2 50,14" fill="#cac1b3"/>
          <polygon points="50,76 90,64 90,59 50,71" fill="#7c624d"/>
        </svg>
      `
    },
    {
      id: 'flooring_sample_oak',
      name: '내추럴 오크 원목 마루',
      category: 'flooring',
      base_w: 1,
      base_h: 1,
      price: 0,
      description: '밝고 따뜻한 오크 원목 체커 마루 바닥재 스킨.',
      is_special: false,
      svg_data: `
        <svg viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="50,14 68,23 50,32 32,23" fill="#f2eae1" stroke="#dfd3c5" stroke-width="0.8"/>
          <polygon points="68,23 86,32 68,41 50,32" fill="#e8ded3" stroke="#d6c8b7" stroke-width="0.8"/>
          <polygon points="32,23 50,32 32,41 14,32" fill="#e8ded3" stroke="#d6c8b7" stroke-width="0.8"/>
          <polygon points="50,32 68,41 50,50 32,41" fill="#f2eae1" stroke="#dfd3c5" stroke-width="0.8"/>
        </svg>
      `
    },
    {
      id: 'window_sample_sunlight',
      name: '선샤인 미니멀 창문',
      category: 'window',
      base_w: 1,
      base_h: 1,
      price: 0,
      description: '따스한 햇살이 바닥에 사선으로 드리우는 슬림 창문 스킨.',
      is_special: false,
      svg_data: `
        <svg viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="24,19 58,26 58,49 24,42" fill="#e8f3fa" stroke="#36322d" stroke-width="1.8"/>
          <line x1="41" y1="22.5" x2="41" y2="45.5" stroke="#36322d" stroke-width="1.2"/>
          <line x1="24" y1="30.5" x2="58" y2="37.5" stroke="#36322d" stroke-width="1.2"/>
        </svg>
      `
    }
  ]

  showToast('샘플 가구 데이터를 생성하는 중입니다... ⏳', 'normal')

  for (const s of sampleItems) {
    try {
      await supabase.from('furniture_catalog').upsert(s)
    } catch (e) {
      // 로컬 fallback 진행
    }
    const mapped = mapDbToAdminItem(s)
    const idx = adminState.catalog.findIndex(i => i.id === s.id)
    if (idx !== -1) {
      adminState.catalog[idx] = mapped
    } else {
      adminState.catalog.push(mapped)
    }
  }

  localStorage.setItem(STORAGE_KEY_CATALOG, JSON.stringify(adminState.catalog))
  renderCatalogList()
  updateStatsBadge()
  showToast('기본 샘플 가구 5종이 성공적으로 등록되었습니다! 📦✨', 'success')
}

// ==========================================================================
// 9. SQL 가이드 모달 & 토스트 알림
// ==========================================================================
export function openSqlModal() {
  const modal = document.getElementById('admin-sql-modal')
  if (modal) modal.classList.add('open')
}

export function closeSqlModal() {
  const modal = document.getElementById('admin-sql-modal')
  if (modal) modal.classList.remove('open')
}

export function copySqlCode() {
  const code = document.getElementById('admin-sql-code')?.innerText || ''
  navigator.clipboard.writeText(code).then(() => {
    showToast('SQL 스크립트가 클립보드에 복사되었습니다! 📋', 'success')
  }).catch(() => {
    showToast('복사에 실패했습니다. 직접 복사해주세요.', 'error')
  })
}

let toastTimer = null
export function showToast(message, type = 'normal') {
  const toast = document.getElementById('admin-toast')
  if (!toast) return

  toast.innerText = message
  toast.className = `admin-toast show ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`

  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.classList.remove('show')
  }, 2800)
}

// ==========================================================================
// 10. 전역 스코프 등록 및 페이지 초기화
// ==========================================================================
window.adminStudio = {
  setResourceTab,
  handleFileSelect,
  clearFileResource,
  handleUrlInput,
  handleSvgInput,
  setGridPreset,
  handleCategoryChange,
  toggleSpecialFields,
  generateRandomId,
  updateLivePreview,
  handleFormSubmit,
  resetForm,
  editFurniture,
  deleteFurniture,
  setListFilter,
  handleSearch,
  seedSampleFurniture,
  openSqlModal,
  closeSqlModal,
  copySqlCode
}

document.addEventListener('DOMContentLoaded', async () => {
  initDropzone()
  generateRandomId()
  updateLivePreview()
  await loadCatalogData()
})
