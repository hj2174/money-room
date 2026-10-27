import { supabase } from './supabaseClient.js'

// 전역 데이터 캐시
let categoryDataList = []

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

// 1. 데이터 가져와서 총 자산 계산 및 파스텔 카드 렌더링
async function fetchCategories() {
  const container = document.getElementById('category-container')
  const totalAmountElem = document.getElementById('total-asset-amount')

  try {
    const { data, error } = await supabase
      .from('budgets_and_categories')
      .select('*')
      .order('id', { ascending: true })

    if (error) throw error

    categoryDataList = data || []

    if (categoryDataList.length > 0) {
      // 총 자산 합산 (전체 항목의 현재 금액 합계 유지: 1,502원)
      const totalCurrent = categoryDataList.reduce((sum, item) => sum + Number(item.current_amount), 0)
      totalAmountElem.textContent = `${totalCurrent.toLocaleString()}원`

      // 자산 목표 카드 목록 ('이번달 총 잔액' 등 통계용 제외, 목표 관리 항목 렌더링)
      const targetItems = categoryDataList.filter(item => item.category_name !== '이번달 총 잔액')

      container.innerHTML = targetItems.map(item => {
        const meta = getCategoryMeta(item.category_name)
        const target = Number(item.target_amount) || 0
        const current = Number(item.current_amount) || 0
        // 달성률: 0~100% 범위로 계산
        const percent = target > 0 ? Math.min(100, Math.max(0, Math.round((current / target) * 100))) : 0
        const isCompleted = percent >= 100

        return `
          <div class="card" id="card-${item.id}">
            <!-- 카드 헤더 (아이콘 + 제목 + 설명 + 진행상태 뱃지) -->
            <div class="card-header-row">
              <div class="card-title-area">
                <div class="card-icon-box ${meta.theme}">
                  ${getIconSvg(meta.icon)}
                </div>
                <div class="card-texts">
                  <span class="card-title-text" id="title-${item.id}">${escapeHtml(item.category_name)}</span>
                  <span class="card-desc-text">${meta.desc}</span>
                </div>
              </div>
              <div class="card-status-badge ${isCompleted ? 'completed' : ''}">
                ${isCompleted ? '목표 달성! 🎉' : '목표 진행중'}
              </div>
            </div>

            <div class="card-divider-line"></div>

            <!-- 목표, 현재 금액 & 우측 수정 버튼 행 -->
            <div class="card-main-row">
              <div class="card-data-grid">
                <div class="card-data-col">
                  <span class="card-col-label">목표</span>
                  <div class="card-col-value privacy-mask" id="col-target-${item.id}" title="살짝 대거나 터치하면 금액이 표시됩니다">
                    ${formatKoreanAmount(item.target_amount)}
                  </div>
                </div>
                <div class="card-data-col">
                  <span class="card-col-label">현재</span>
                  <div class="card-col-value privacy-mask" id="col-current-${item.id}" title="살짝 대거나 터치하면 금액이 표시됩니다">
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
      }).join('')
    } else {
      totalAmountElem.textContent = '0원'
      container.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 24px 0;">등록된 자산 목표가 없습니다.</p>'
    }

  } catch (error) {
    console.error('데이터 로드 실패:', error.message)
    container.innerHTML = '<p style="color: #ef4444; text-align: center; padding: 24px 0;">데이터 로드 실패!</p>'
  }
}

// 2. 수정 모드 활성화 (수정 버튼 클릭 시 헤더 이름 및 목표/현재가 input으로 전환)
function enableEdit(categoryId) {
  const item = categoryDataList.find(d => String(d.id) === String(categoryId))
  if (!item) return

  const titleElem = document.getElementById(`title-${categoryId}`)
  const colTarget = document.getElementById(`col-target-${categoryId}`)
  const colCurrent = document.getElementById(`col-current-${categoryId}`)
  const actionsDiv = document.getElementById(`actions-${categoryId}`)

  if (!titleElem || !colTarget || !colCurrent || !actionsDiv) return

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

// 4. [저장] 버튼: 이름, 목표금액, 현재금액을 통째로 업데이트하기 (alert 없이 즉시 저장)
async function updateCategory(categoryId) {
  const nameInput = document.getElementById(`name-${categoryId}`)
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

// 전역 등록
window.enableEdit = enableEdit
window.cancelEdit = cancelEdit
window.handleUpdate = updateCategory
window.handleAddCategory = addCategory
window.openModal = openModal
window.closeModal = closeModal

// 초기 실행
fetchCategories()
initPrivacyMaskTouch()
