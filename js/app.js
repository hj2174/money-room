import { supabase } from './supabaseClient.js'

// 전역 데이터 캐시
let categoryDataList = []
let monthlyRecordList = []
let cachedTotalAsset = 0
let cachedUnallocated = 0
let currentGoalTab = 'ongoing' // 'ongoing' (진행중) | 'completed' (완료)

// 저축성 지출 및 자산 이동(이체) 여부 판별
function isSavingsRecord(record, goalNames) {
  if (!record) return false
  if (record.type === 'transfer') return true
  const memo = (record.memo || '').trim()
  if (/\[(?:목표|🎯):?([^\]]+)\]/.test(memo)) return true
  const cat = (record.category || '').trim()
  return goalNames.has(cat)
}

// 💰 전체 총자산 및 자산 배분 구조(모금액, 보유현금) 계산
function calculateAssets() {
  const targetItems = categoryDataList.filter(item => item.category_name !== '이번달 총 잔액')
  const goalNames = new Set(targetItems.map(item => (item.category_name || '').trim()))

  let totalIncome = 0
  let totalLivingExpense = 0
  let totalSavingsExpense = 0

  monthlyRecordList.forEach(r => {
    const amt = Number(r.amount) || 0
    if (r.type === 'income') {
      totalIncome += amt
    } else if (r.type === 'expense') {
      if (isSavingsRecord(r, goalNames)) {
        totalSavingsExpense += amt
      } else {
        totalLivingExpense += amt
      }
    } else if (r.type === 'transfer') {
      // 저금: 소비성 지출에서 제외되며 자산 목표 모금액으로 이동
      totalSavingsExpense += amt
    }
  })

  // 누적 월별 수지 = 총 수입 - 일반 생활 지출 (저축성 지출은 자산 목표에 배분되어 총자산 내에 보존됨)
  const cumulativeNetFlow = totalIncome - totalLivingExpense

  // 기초 자산(기존 보유 잔액)
  const baseItem = categoryDataList.find(item => item.category_name === '이번달 총 잔액')
  const baseAsset = Number(baseItem?.current_amount) || 0

  // 전체 총자산 = 기초 자산 + 누적 월별 수지
  const totalAsset = baseAsset + cumulativeNetFlow

  // 각 목표별로 배분된 금액의 총합
  const totalAllocated = targetItems.reduce((sum, item) => sum + Number(item.current_amount || 0), 0)

  // 미배분 여유 자금 = 전체 총자산 - 배분된 금액 합계
  const unallocatedAsset = totalAsset - totalAllocated

  cachedTotalAsset = totalAsset
  cachedUnallocated = unallocatedAsset

  return {
    baseAsset,
    cumulativeNetFlow,
    totalAsset,
    totalAllocated,
    unallocatedAsset,
    targetItems
  }
}

// 숫자 금액을 한국어 단위(억, 만, 천, 원) 문자열로 변환하는 함수
function formatKoreanAmount(num) {
  num = Number(num)
  if (isNaN(num) || num === 0) return '0원'

  const eok = Math.floor(num / 100000000)
  const man = Math.floor((num % 100000000) / 10000)
  const cheon = Math.floor((num % 10000) / 1000)
  const rest = num % 1000

  let parts = []
  if (eok > 0) parts.push(`${eok.toLocaleString()}억`)
  if (man > 0) parts.push(`${man.toLocaleString()}만`)
  if (cheon > 0) parts.push(`${cheon.toLocaleString()}천`)
  if (rest > 0) parts.push(`${rest.toLocaleString()}원`)

  if (parts.length === 0) return '0원'

  let result = parts.join(' ')
  if (rest === 0) {
    result += '원'
  }
  return result
}

// 카테고리별 설명 문구 및 아이콘 메타 정보 반환
function getCategoryMeta(name) {
  const n = (name || '').trim()
  if (n.includes('비상')) {
    return {
      desc: '언제든 사용할 수 있는 여유 자금이에요.',
      icon: 'wallet',
      theme: 'purple'
    }
  }
  if (n.includes('결혼')) {
    return {
      desc: '행복한 미래를 위한 소중한 준비예요.',
      icon: 'coins',
      theme: 'blue'
    }
  }
  if (n.includes('주식') || n.includes('투자')) {
    return {
      desc: '성장과 미래를 위한 투자 자금이에요.',
      icon: 'coins',
      theme: 'blue'
    }
  }
  if (n.includes('집') || n.includes('부동산')) {
    return {
      desc: '따뜻한 내 집 마련의 꿈이에요.',
      icon: 'coins',
      theme: 'blue'
    }
  }
  if (n.includes('여행')) {
    return {
      desc: '설레는 휴식과 힐링을 위한 자금이에요.',
      icon: 'wallet',
      theme: 'purple'
    }
  }
  return {
    desc: '소중한 목표를 위해 모아가는 자산이에요.',
    icon: 'wallet',
    theme: 'purple'
  }
}

// SVG 아이콘 헬퍼
function getIconSvg(iconType) {
  if (iconType === 'coins') {
    return `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 3.79 2 6v12c0 2.21 4.48 4 10 4s10-1.79 10-4V6c0-2.21-4.48-4-10-4zm0 2c4.42 0 8 1.34 8 2s-3.58 2-8 2-8-1.34-8-2 3.58-2 8-2zm8 14c0 .66-3.58 2-8 2s-8-1.34-8-2v-2.12c1.94 1.29 4.84 2.12 8 2.12s6.06-.83 8-2.12V18zm0-4c0 .66-3.58 2-8 2s-8-1.34-8-2v-2.12c1.94 1.29 4.84 2.12 8 2.12s6.06-.83 8-2.12V14zm0-4c0 .66-3.58 2-8 2s-8-1.34-8-2V7.88c1.94 1.29 4.84 2.12 8 2.12s6.06-.83 8-2.12V10z"/></svg>`
  }
  // 기본 지갑 아이콘
  return `<svg viewBox="0 0 24 24"><path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`
}

// HTML 이스케이프
function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// =======================================================
// 📌 카테고리 순서 및 커스텀 아이콘 관리 로직
// =======================================================
const CATEGORY_ORDER_KEY = 'moneyroom_category_order'
const CATEGORY_ICON_KEY = 'moneyroom_category_icons'
let draggedCategoryId = null

function getSavedCategoryOrder() {
  try {
    const saved = localStorage.getItem(CATEGORY_ORDER_KEY)
    return saved ? JSON.parse(saved) : []
  } catch (e) {
    return []
  }
}

function saveCategoryOrder(orderIds) {
  try {
    localStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(orderIds))
  } catch (e) {
    console.error('순서 저장 실패:', e)
  }
}

function getSavedCategoryIcons() {
  try {
    const saved = localStorage.getItem(CATEGORY_ICON_KEY)
    return saved ? JSON.parse(saved) : {}
  } catch (e) {
    return {}
  }
}

function saveCategoryIcon(id, icon) {
  try {
    const icons = getSavedCategoryIcons()
    icons[id] = icon
    localStorage.setItem(CATEGORY_ICON_KEY, JSON.stringify(icons))
  } catch (e) {
    console.error('아이콘 저장 실패:', e)
  }
}

// 카테고리 아이콘 반환 (사용자 설정 우선, 없으면 기본 이모지)
function getCategoryIcon(item) {
  const savedIcons = getSavedCategoryIcons()
  if (savedIcons[item.id]) {
    return savedIcons[item.id]
  }

  const name = (item.category_name || '').trim()
  if (name.includes('비상')) return '💳'
  if (name.includes('결혼')) return '💍'
  if (name.includes('주식') || name.includes('투자')) return '📈'
  if (name.includes('집') || name.includes('부동산')) return '🏠'
  if (name.includes('여행')) return '✈️'
  return '💰'
}

// 목표 달성 여부 (목표금액이 있고, 현재금액이 목표금액 이상인 경우)
function isGoalCompleted(item) {
  const target = Number(item.target_amount) || 0
  const current = Number(item.current_amount) || 0
  return target > 0 && current >= target
}

// 1. 자산 목표 카드 렌더링 (월별 수지 연동 총자산 반영 & 자산 배분 현황 시각화)
function renderCategoryCards() {
  const container = document.getElementById('category-container')
  const totalAmountElem = document.getElementById('total-asset-amount')
  if (!container) return

  // 💰 전체 총자산 및 자산 배분액 계산
  const {
    baseAsset,
    cumulativeNetFlow,
    totalAsset,
    totalAllocated,
    unallocatedAsset,
    targetItems
  } = calculateAssets()

  // 총 자산 UI 반영
  if (totalAmountElem) {
    totalAmountElem.textContent = `${totalAsset.toLocaleString()}원`
  }

  // 자산 배분 현황 (보유현금 및 보유현금 비율 바) UI 반영
  const unallocElem = document.getElementById('unallocated-amount')
  const barFill = document.getElementById('allocation-bar-fill')

  if (unallocElem) {
    unallocElem.textContent = `${unallocatedAsset.toLocaleString()}원`
  }

  // 여유 자금(보유현금)이 바에서 색상으로 차오르도록 비율 적용
  const unallocRate = totalAsset > 0 
    ? Math.min(100, Math.max(0, Math.round((unallocatedAsset / totalAsset) * 100))) 
    : 0

  if (barFill) {
    barFill.style.width = `${unallocRate}%`
    barFill.setAttribute('title', `보유현금 ${unallocRate}% (${unallocatedAsset.toLocaleString()}원)`)
  }

  if (targetItems.length === 0) {
    container.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 24px 0;">등록된 자산 목표가 없습니다.</p>'
    return
  }

  const savedOrder = getSavedCategoryOrder()

  function getOrderIndex(itemId) {
    const idx = savedOrder.indexOf(String(itemId))
    return idx === -1 ? 99999 : idx
  }

  // 1차: 사용자 지정 순서 정렬
  targetItems.sort((a, b) => getOrderIndex(a.id) - getOrderIndex(b.id))

  // 2차: 진행 중 vs 목표 달성 완료 그룹 분리
  const ongoingItems = targetItems.filter(item => !isGoalCompleted(item))
  const completedItems = targetItems.filter(item => isGoalCompleted(item))

  // 탭 카운트 및 활성화 상태 갱신
  const ongoingTab = document.getElementById('tab-ongoing')
  const completedTab = document.getElementById('tab-completed')
  if (ongoingTab) ongoingTab.textContent = `진행중 (${ongoingItems.length})`
  if (completedTab) completedTab.textContent = `완료 (${completedItems.length})`

  // 개별 카드 렌더러 함수
  function renderCard(item, indexInGroup, totalInGroup) {
    const icon = getCategoryIcon(item)
    const target = Number(item.target_amount) || 0
    const current = Number(item.current_amount) || 0
    const percent = target > 0 ? Math.min(100, Math.max(0, Math.round((current / target) * 100))) : 0
    const isCompleted = isGoalCompleted(item)

    return `
      <div class="card ${isCompleted ? 'card-completed' : ''}" 
           id="card-${item.id}"
           draggable="true"
           ondragstart="window.handleCardDragStart(event, '${item.id}')"
           ondragover="window.handleCardDragOver(event, '${item.id}')"
           ondragleave="window.handleCardDragLeave(event, '${item.id}')"
           ondrop="window.handleCardDrop(event, '${item.id}')"
           ondragend="window.handleCardDragEnd(event)">
        <!-- 카드 헤더 (아이콘 + 제목 + 순서이동 버튼 + 진행상태 뱃지) -->
        <div class="card-header-row">
          <div class="card-title-area">
            <div class="card-icon-box" id="icon-box-${item.id}">
              ${escapeHtml(icon)}
            </div>
            <div class="card-texts">
              <span class="card-title-text" id="title-${item.id}">${escapeHtml(item.category_name)}</span>
            </div>
          </div>
          <div class="card-header-right">
            <div class="card-status-badge ${isCompleted ? 'completed' : ''}">
              ${isCompleted ? '목표 달성! 🎉' : '목표 진행중'}
            </div>
          </div>
        </div>

        <div class="card-divider-line"></div>

        <!-- 목표, 현재 금액 & 우측 수정 버튼 행 -->
        <div class="card-main-row">
          <div class="card-data-grid">
            <div class="card-data-col">
              <span class="card-col-label">목표</span>
              <div class="card-col-value" id="col-target-${item.id}">
                ${formatKoreanAmount(item.target_amount)}
              </div>
            </div>
            <div class="card-data-col">
              <span class="card-col-label">모금액</span>
              <div class="card-col-value" id="col-current-${item.id}">
                ${current.toLocaleString()}원
              </div>
            </div>
          </div>

          <!-- 우측 수정 버튼 액션 -->
          <div class="card-action-wrap" id="actions-${item.id}">
            <button onclick="window.enableEdit('${item.id}')" class="btn-card-edit">
              수정 &gt;
            </button>
          </div>
        </div>

        <!-- 한 줄 전체 차지하는 프로그레스 바 -->
        <div class="card-progress-wrap">
          <div class="card-progress-bar">
            <div class="card-progress-filled" style="width: ${percent}%;"></div>
          </div>
          <span class="card-progress-text">${percent}%</span>
        </div>
      </div>
    `
  }

  // 탭 선택(진행중 vs 완료)에 따라 분리하여 렌더링
  const displayItems = currentGoalTab === 'ongoing' ? ongoingItems : completedItems

  if (displayItems.length === 0) {
    if (currentGoalTab === 'ongoing') {
      container.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 36px 0;">진행 중인 자산 목표가 없습니다.</p>'
    } else {
      container.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 36px 0;">아직 달성 완료된 목표가 없습니다.<br><span style="font-size: 12px; color: #cbd5e1; margin-top: 6px; display: inline-block;">목표 금액을 100% 달성하면 이곳에 모입니다! 🎉</span></p>'
    }
    return
  }

  container.innerHTML = displayItems.map((item, idx) => renderCard(item, idx, displayItems.length)).join('')
}

// 📑 진행중 / 완료 탭 전환
function setGoalTab(tab) {
  currentGoalTab = tab
  document.querySelectorAll('.filter-tabs .filter-btn').forEach(btn => btn.classList.remove('active'))
  const activeBtn = document.getElementById(`tab-${tab}`)
  if (activeBtn) activeBtn.classList.add('active')
  renderCategoryCards()
}


// 데이터 가져와서 총 자산 계산 및 카드 렌더링 (월별 수지 데이터와 동시 조회)
async function fetchCategories() {
  const container = document.getElementById('category-container')

  try {
    const [catRes, monthlyRes] = await Promise.all([
      supabase.from('budgets_and_categories').select('*').order('id', { ascending: true }),
      supabase.from('monthly_records').select('*')
    ])

    if (catRes.error) throw catRes.error
    if (monthlyRes.error) throw monthlyRes.error

    categoryDataList = catRes.data || []
    monthlyRecordList = monthlyRes.data || []
    renderCategoryCards()

  } catch (error) {
    console.error('데이터 로드 실패:', error.message)
    if (container) {
      container.innerHTML = '<p style="color: #ef4444; text-align: center; padding: 24px 0;">데이터 로드 실패!</p>'
    }
  }
}

// 2. 수정 모드 활성화 (수정 버튼 클릭 시 아이콘, 헤더 이름 및 목표/현재가 input으로 전환)
function enableEdit(categoryId) {
  const item = categoryDataList.find(d => String(d.id) === String(categoryId))
  if (!item) return

  const titleElem = document.getElementById(`title-${categoryId}`)
  const iconBox = document.getElementById(`icon-box-${categoryId}`)
  const colTarget = document.getElementById(`col-target-${categoryId}`)
  const colCurrent = document.getElementById(`col-current-${categoryId}`)
  const actionsDiv = document.getElementById(`actions-${categoryId}`)

  if (!titleElem || !colTarget || !colCurrent || !actionsDiv) return

  // 아이콘 인풋창으로 교체 (이모지/텍스트 수정 가능)
  const currentIcon = getCategoryIcon(item)
  if (iconBox) {
    iconBox.innerHTML = `<input type="text" id="icon-${categoryId}" class="card-icon-input" value="${escapeHtml(currentIcon)}" maxlength="2" title="이모지/아이콘 수정">`
  }

  // 헤더의 이름을 인풋창으로 교체
  titleElem.innerHTML = `<input type="text" id="name-${categoryId}" class="card-title-input" value="${escapeHtml(item.category_name)}">`
  colTarget.innerHTML = `<input type="number" id="target-${categoryId}" class="card-col-input" value="${item.target_amount}">`
  colCurrent.innerHTML = `<input type="number" id="current-${categoryId}" class="card-col-input" value="${item.current_amount}">`

  // 헤더 이름 입력창 포커스
  const nameInput = document.getElementById(`name-${categoryId}`)
  if (nameInput) nameInput.focus()

  // 액션 버튼 전환 (저장 / 취소)
  actionsDiv.innerHTML = `
    <div class="card-edit-btns">
      <button onclick="window.handleUpdate('${categoryId}')" class="btn-card-save">저장 &gt;</button>
      <button onclick="window.cancelEdit()" class="btn-card-cancel">취소</button>
    </div>
  `
}

// 3. 수정 취소 (데이터 다시 조회하여 원래대로 복원)
function cancelEdit() {
  fetchCategories()
}

// 4. [저장] 버튼: 아이콘, 이름, 목표금액, 현재금액을 통째로 업데이트하기 (alert 없이 즉시 저장)
async function updateCategory(categoryId) {
  const nameInput = document.getElementById(`name-${categoryId}`)
  const iconInput = document.getElementById(`icon-${categoryId}`)
  const targetInput = document.getElementById(`target-${categoryId}`)
  const currentInput = document.getElementById(`current-${categoryId}`)

  if (!nameInput || !targetInput || !currentInput) return

  const newName = nameInput.value.trim()
  const newTarget = Number(targetInput.value)
  const newCurrent = Number(currentInput.value)

  if (!newName) {
    alert('항목 이름을 입력해주세요!')
    nameInput.focus()
    return
  }

  // 아이콘 저장
  if (iconInput) {
    const newIcon = iconInput.value.trim() || '💰'
    saveCategoryIcon(categoryId, newIcon)
  }

  try {
    const { error } = await supabase
      .from('budgets_and_categories')
      .update({ 
        category_name: newName, 
        target_amount: isNaN(newTarget) ? 0 : newTarget, 
        current_amount: isNaN(newCurrent) ? 0 : newCurrent 
      })
      .eq('id', categoryId)

    if (error) throw error

    // 알림창 없이 즉시 화면 재렌더링
    fetchCategories()

  } catch (error) {
    console.error('수정 중 에러 발생:', error.message)
    alert('수정에 실패했습니다.')
  }
}

// 5. [추가하기] 팝업 내부의 추가 버튼 로직
async function addCategory() {
  const nameInput = document.getElementById('new-category-name')
  const targetInput = document.getElementById('new-target-amount')

  const categoryName = nameInput.value.trim()
  const targetAmount = Number(targetInput.value)

  if (!categoryName) {
    alert('항목 이름을 입력해주세요!')
    nameInput.focus()
    return
  }

  try {
    const { error } = await supabase
      .from('budgets_and_categories')
      .insert([
        { 
          category_name: categoryName, 
          target_amount: isNaN(targetAmount) ? 0 : targetAmount, 
          current_amount: 0 
        }
      ])

    if (error) throw error

    nameInput.value = ''
    targetInput.value = ''
    closeModal()

    fetchCategories()

  } catch (error) {
    console.error('추가 중 에러 발생:', error.message)
    alert('추가에 실패했습니다.')
  }
}

// 팝업 모달 제어 함수
function openModal() {
  document.getElementById('add-modal').style.display = 'flex'
  const nameInput = document.getElementById('new-category-name')
  if (nameInput) nameInput.focus()
}

function closeModal() {
  document.getElementById('add-modal').style.display = 'none'
}

// ⚙️ 기초 자산(초기 자본) 설정 모달 제어 함수
function openBaseAssetModal() {
  const baseItem = categoryDataList.find(item => item.category_name === '이번달 총 잔액')
  const input = document.getElementById('base-asset-input')
  if (input) {
    input.value = baseItem ? baseItem.current_amount : 0
  }
  document.getElementById('base-asset-modal').style.display = 'flex'
  if (input) input.focus()
}

function closeBaseAssetModal() {
  document.getElementById('base-asset-modal').style.display = 'none'
}

async function handleSaveBaseAsset() {
  const input = document.getElementById('base-asset-input')
  const val = Number(input.value)
  if (isNaN(val) || val < 0) {
    alert('올바른 기초 자산 금액을 입력해주세요!')
    input.focus()
    return
  }

  try {
    const baseItem = categoryDataList.find(item => item.category_name === '이번달 총 잔액')
    if (baseItem) {
      const { error } = await supabase
        .from('budgets_and_categories')
        .update({ current_amount: val })
        .eq('id', baseItem.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('budgets_and_categories')
        .insert([{ category_name: '이번달 총 잔액', target_amount: 0, current_amount: val }])
      if (error) throw error
    }

    closeBaseAssetModal()
    fetchCategories()
  } catch (error) {
    console.error('기초 자산 저장 실패:', error.message)
    alert('기초 자산 저장 중 오류가 발생했습니다.')
  }
}

// 모바일 환경 터치 시 일시적 마스킹 해제 인터랙션 등록
function initPrivacyMaskTouch() {
  document.addEventListener('touchstart', (e) => {
    const maskElem = e.target.closest('.privacy-mask')
    if (maskElem) {
      maskElem.classList.add('revealed')
    }
  }, { passive: true })

  document.addEventListener('touchend', (e) => {
    const maskElem = e.target.closest('.privacy-mask')
    if (maskElem) {
      setTimeout(() => {
        maskElem.classList.remove('revealed')
      }, 1200) // 터치 종료 후 1.2초 뒤 다시 블러 처리
    }
  }, { passive: true })
}

// =======================================================
// 🔄 순서 변경 핸들러 (버튼 클릭 & 드래그 앤 드롭)
// =======================================================

// 위/아래 버튼 클릭으로 순서 변경
function moveCategory(id, direction) {
  const targetItems = categoryDataList.filter(item => item.category_name !== '이번달 총 잔액')
  const savedOrder = getSavedCategoryOrder()

  function getOrderIndex(itemId) {
    const idx = savedOrder.indexOf(String(itemId))
    return idx === -1 ? 99999 : idx
  }

  // 1차: 사용자 순서 적용
  targetItems.sort((a, b) => getOrderIndex(a.id) - getOrderIndex(b.id))

  const item = targetItems.find(t => String(t.id) === String(id))
  if (!item) return

  const completed = isGoalCompleted(item)
  // 동일한 상태(진행중 vs 달성완료) 그룹 내에서만 위치 이동
  const groupItems = targetItems.filter(t => isGoalCompleted(t) === completed)
  const groupIdx = groupItems.findIndex(t => String(t.id) === String(id))

  if (direction === 'up' && groupIdx > 0) {
    const prevItem = groupItems[groupIdx - 1]
    swapItemsInOrder(item.id, prevItem.id, targetItems)
  } else if (direction === 'down' && groupIdx < groupItems.length - 1) {
    const nextItem = groupItems[groupIdx + 1]
    swapItemsInOrder(item.id, nextItem.id, targetItems)
  }

  renderCategoryCards()
}

// 저장소에서 두 항목 순서 맞교환
function swapItemsInOrder(idA, idB, allItems) {
  let order = getSavedCategoryOrder()
  if (order.length === 0 || allItems.some(item => !order.includes(String(item.id)))) {
    order = allItems.map(item => String(item.id))
  }

  const idxA = order.indexOf(String(idA))
  const idxB = order.indexOf(String(idB))

  if (idxA !== -1 && idxB !== -1) {
    const temp = order[idxA]
    order[idxA] = order[idxB]
    order[idxB] = temp
    saveCategoryOrder(order)
  }
}

// 드래그 관련 스타일 모두 제거
function clearDragStyles() {
  document.querySelectorAll('.card').forEach(c => {
    c.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom')
  })
}

// 드래그 앤 드롭 시작
function handleCardDragStart(e, id) {
  draggedCategoryId = id
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', id)
  const card = document.getElementById(`card-${id}`)
  if (card) {
    setTimeout(() => card.classList.add('dragging'), 0)
  }
}

// 드래그 중인 카드가 다른 카드 위를 지날 때 이동될 위치(위/아래) 점선 표시
function handleCardDragOver(e, targetId) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'

  if (!draggedCategoryId || String(draggedCategoryId) === String(targetId)) return

  const targetCard = document.getElementById(`card-${targetId}`)
  if (!targetCard) return

  const rect = targetCard.getBoundingClientRect()
  const midY = rect.top + rect.height / 2
  const isTop = e.clientY < midY

  // 다른 모든 카드의 점선 클래스 제거
  document.querySelectorAll('.card').forEach(c => {
    if (c !== targetCard) {
      c.classList.remove('drag-over-top', 'drag-over-bottom')
    }
  })

  // 마우스 커서 위치(위/아래)에 따라 점선 표시 클래스 적용
  if (isTop) {
    targetCard.classList.add('drag-over-top')
    targetCard.classList.remove('drag-over-bottom')
  } else {
    targetCard.classList.add('drag-over-bottom')
    targetCard.classList.remove('drag-over-top')
  }
}

// 마우스가 카드를 벗어났을 때 점선 제거
function handleCardDragLeave(e, targetId) {
  const targetCard = document.getElementById(`card-${targetId}`)
  if (targetCard && !targetCard.contains(e.relatedTarget)) {
    targetCard.classList.remove('drag-over-top', 'drag-over-bottom')
  }
}

// 드래그 드롭 시 점선이 표시되었던 정확한 위치로 순서 변경
function handleCardDrop(e, targetId) {
  e.preventDefault()
  if (!draggedCategoryId || String(draggedCategoryId) === String(targetId)) {
    clearDragStyles()
    draggedCategoryId = null
    return
  }

  const targetCard = document.getElementById(`card-${targetId}`)
  const isTop = targetCard ? targetCard.classList.contains('drag-over-top') : true
  clearDragStyles()

  const targetItems = categoryDataList.filter(item => item.category_name !== '이번달 총 잔액')
  let order = getSavedCategoryOrder()
  if (order.length === 0 || targetItems.some(item => !order.includes(String(item.id)))) {
    order = targetItems.map(item => String(item.id))
  }

  const fromIdx = order.indexOf(String(draggedCategoryId))
  if (fromIdx === -1) {
    draggedCategoryId = null
    return
  }

  // 드래그한 원본 항목 제거
  const [moved] = order.splice(fromIdx, 1)

  // 타겟 위치 재계산 (상단 점선이면 타겟 자리, 하단 점선이면 타겟 다음 자리)
  let toIdx = order.indexOf(String(targetId))
  if (toIdx === -1) {
    toIdx = order.length
  } else if (!isTop) {
    toIdx += 1
  }

  order.splice(toIdx, 0, moved)
  saveCategoryOrder(order)
  draggedCategoryId = null
  renderCategoryCards()
}

// 드래그 종료 시 클래스 제거
function handleCardDragEnd() {
  clearDragStyles()
  draggedCategoryId = null
}

// 전역 등록
window.enableEdit = enableEdit
window.cancelEdit = cancelEdit
window.handleUpdate = updateCategory
window.handleAddCategory = addCategory
window.openModal = openModal
window.closeModal = closeModal
window.openBaseAssetModal = openBaseAssetModal
window.closeBaseAssetModal = closeBaseAssetModal
window.handleSaveBaseAsset = handleSaveBaseAsset
window.setGoalTab = setGoalTab
window.moveCategory = moveCategory
window.handleCardDragStart = handleCardDragStart
window.handleCardDragOver = handleCardDragOver
window.handleCardDragLeave = handleCardDragLeave
window.handleCardDrop = handleCardDrop
window.handleCardDragEnd = handleCardDragEnd

// 초기 실행
fetchCategories()
initPrivacyMaskTouch()
