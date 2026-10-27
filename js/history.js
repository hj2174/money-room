import { supabase } from './supabaseClient.js'

// 현재 선택된 날짜 (기본값: 오늘)
let currentDate = new Date()
let currentFilter = 'all' // 'all', 'income', 'expense'
let selectedType = 'expense' // 모달 내 기본값: 지출
let currentRecords = []
let editingRecordId = null // 현재 수정 중인 레코드 ID (null이면 신규 추가)
let prevMonthRecordsCache = [] // 전달 내역 복사용 캐시

// ⚡ 빠른 템플릿 기본 데이터셋 (수입 / 지출)
const QUICK_TEMPLATES = {
  income: [
    { name: '월급', amount: 3000000, icon: '💰' },
    { name: '보너스', amount: 500000, icon: '🎁' },
    { name: '용돈', amount: 100000, icon: '💵' },
    { name: '부수입', amount: 200000, icon: '📈' }
  ],
  expense: [
    { name: '식비', amount: 30000, icon: '🍚' },
    { name: '통신비', amount: 65000, icon: '📱' },
    { name: '관리비', amount: 150000, icon: '🏠' },
    { name: '보험비', amount: 120000, icon: '🛡️' },
    { name: '카페/간식', amount: 6000, icon: '☕' },
    { name: '교통비', amount: 60000, icon: '🚌' },
    { name: '쇼핑', amount: 50000, icon: '🛍️' },
    { name: '공과금', amount: 80000, icon: '💡' }
  ]
}

// 🎨 차트 전용 파스텔 컬러 팔레트
const CHART_COLORS = [
  '#6366f1', // 인디고/바이올렛
  '#ec4899', // 핑크
  '#f59e0b', // 앰버
  '#10b981', // 에메랄드
  '#06b6d4', // 시안
  '#8b5cf6', // 퍼플
  '#f97316', // 오렌지
  '#64748b'  // 슬레이트
]

// 날짜 유틸리티: YYYY-MM 형식 반환
function getYearMonthString(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

// 날짜 유틸리티: 전월 YYYY-MM 형식 반환
function getPrevYearMonthString(date) {
  const prev = new Date(date.getFullYear(), date.getMonth() - 1, 1)
  return getYearMonthString(prev)
}

// 날짜 라벨 포맷: "2026년 10월"
function formatMonthLabel(date) {
  return `${date.getFullYear()}년 ${String(date.getMonth() + 1).padStart(2, '0')}월`
}

// 1. 월별 데이터 조회 및 화면 갱신
async function fetchMonthlyData() {
  const currentYM = getYearMonthString(currentDate)
  const prevYM = getPrevYearMonthString(currentDate)

  // 월 표시 레이블 및 input 동기화
  document.getElementById('month-label').textContent = formatMonthLabel(currentDate)
  document.getElementById('month-picker').value = currentYM
  document.getElementById('compare-prev-month-label').textContent = `${prevYM} 대비`

  const recordContainer = document.getElementById('record-container')

  try {
    // 당월 및 전월 데이터 동시 조회
    const [currentRes, prevRes] = await Promise.all([
      supabase
        .from('monthly_records')
        .select('*')
        .eq('year_month', currentYM)
        .order('created_at', { ascending: false }),
      supabase
        .from('monthly_records')
        .select('*')
        .eq('year_month', prevYM)
    ])

    if (currentRes.error) throw currentRes.error
    if (prevRes.error) throw prevRes.error

    currentRecords = currentRes.data || []
    const prevRecords = prevRes.data || []

    // 요약 계산 및 차트 렌더링
    calculateAndRenderSummary(currentRecords, prevRecords)

    // 리스트 렌더링
    renderRecordList()

  } catch (error) {
    console.error('월별 데이터 로드 실패:', error.message)
    recordContainer.innerHTML = `
      <div style="text-align: center; padding: 20px; color: #ef4444;">
        <p>데이터를 불러오지 못했습니다.</p>
        <p style="font-size: 12px; color: #9ca3af; margin-top: 6px;">(Supabase에 monthly_records 테이블이 생성되어 있는지 확인해주세요)</p>
      </div>
    `
  }
}

// 2. 상단 요약, 차트 및 지난달 비교 렌더링
function calculateAndRenderSummary(curRecords, prevRecords) {
  // 당월 집계
  const curIncome = curRecords
    .filter(r => r.type === 'income')
    .reduce((sum, r) => sum + Number(r.amount), 0)

  const curExpense = curRecords
    .filter(r => r.type === 'expense')
    .reduce((sum, r) => sum + Number(r.amount), 0)

  const curNet = curIncome - curExpense

  // 전월 집계
  const prevIncome = prevRecords
    .filter(r => r.type === 'income')
    .reduce((sum, r) => sum + Number(r.amount), 0)

  const prevExpense = prevRecords
    .filter(r => r.type === 'expense')
    .reduce((sum, r) => sum + Number(r.amount), 0)

  const prevNet = prevIncome - prevExpense

  // UI 바인딩: 요약 박스
  const summaryBox = document.getElementById('flow-summary-box')
  const netElem = document.getElementById('net-amount')
  const incomeElem = document.getElementById('total-income')
  const expenseElem = document.getElementById('total-expense')

  netElem.textContent = `${curNet >= 0 ? '+' : ''}${curNet.toLocaleString()}원`
  incomeElem.textContent = `+${curIncome.toLocaleString()}원`
  expenseElem.textContent = `-${curExpense.toLocaleString()}원`

  if (curNet < 0) {
    summaryBox.classList.add('negative')
  } else {
    summaryBox.classList.remove('negative')
  }

  // 지난달 비교 렌더링
  renderComparison(curIncome, curExpense, curNet, prevIncome, prevExpense, prevNet, prevRecords.length > 0)

  // 📊 카테고리별 지출 비중 도넛 차트 렌더링
  renderExpenseChart(curRecords)
}

// 📊 카테고리별 지출 비중 둥근 도넛 차트 렌더링
function renderExpenseChart(curRecords) {
  const chartBody = document.getElementById('chart-card-body')
  const chartTotalElem = document.getElementById('chart-total-expense')
  if (!chartBody) return

  const expenseRecords = curRecords.filter(r => r.type === 'expense')
  const totalExp = expenseRecords.reduce((sum, r) => sum + Number(r.amount), 0)

  chartTotalElem.textContent = `총 ${totalExp.toLocaleString()}원`

  if (expenseRecords.length === 0 || totalExp === 0) {
    chartBody.innerHTML = '<div class="chart-empty-message">이번 달 등록된 지출 내역이 없습니다.</div>'
    return
  }

  // 카테고리별 집계
  const catMap = {}
  expenseRecords.forEach(r => {
    const cat = (r.category || '기타').trim()
    catMap[cat] = (catMap[cat] || 0) + Number(r.amount)
  })

  // 내림차순 정렬
  const sortedCats = Object.entries(catMap)
    .map(([category, amount]) => ({
      category,
      amount,
      percent: Math.round((amount / totalExp) * 100)
    }))
    .sort((a, b) => b.amount - a.amount)

  // conic-gradient 각도 계산
  let currentDeg = 0
  const gradientSegments = sortedCats.map((item, idx) => {
    const color = CHART_COLORS[idx % CHART_COLORS.length]
    const deg = (item.amount / totalExp) * 360
    const start = currentDeg
    const end = currentDeg + deg
    currentDeg = end
    return `${color} ${start}deg ${end}deg`
  })

  const conicStyle = `background: conic-gradient(${gradientSegments.join(', ')});`

  // 간결한 금액 표기 (예: 15만원, 5,000원)
  const shortTotal = totalExp >= 10000 
    ? `${Math.round(totalExp / 10000).toLocaleString()}만원` 
    : `${totalExp.toLocaleString()}원`

  chartBody.innerHTML = `
    <!-- 도넛 차트 -->
    <div class="donut-chart-wrap">
      <div class="donut-chart" style="${conicStyle}"></div>
      <div class="donut-hole">
        <span class="donut-hole-label">총 지출</span>
        <span class="donut-hole-value">${shortTotal}</span>
      </div>
    </div>

    <!-- 우측 범례 리스트 -->
    <div class="chart-legend-list">
      ${sortedCats.map((item, idx) => {
        const color = CHART_COLORS[idx % CHART_COLORS.length]
        return `
          <div class="legend-item">
            <div class="legend-left">
              <span class="legend-dot" style="background: ${color};"></span>
              <span class="legend-name">${escapeHtml(item.category)}</span>
            </div>
            <div class="legend-right">
              <span class="legend-percent">${item.percent}%</span>
              <span class="legend-amount">(${item.amount.toLocaleString()}원)</span>
            </div>
          </div>
        `
      }).join('')}
    </div>
  `
}

// 지난달 비교 뷰 렌더링
function renderComparison(curInc, curExp, curNet, prevInc, prevExp, prevNet, hasPrevData) {
  const compareContent = document.getElementById('compare-content')

  if (!hasPrevData) {
    compareContent.innerHTML = `<span style="color: #94a3b8;">지난달(이전 달) 등록된 내역이 없습니다.</span>`
    return
  }

  // 지출 차이 (당월 - 전월)
  const expDiff = curExp - prevExp
  // 잔여 현금흐름 차이 (당월 - 전월)
  const netDiff = curNet - prevNet

  let expText = ''
  if (expDiff > 0) {
    expText = `지출이 지난달보다 <span class="compare-tag increase">${expDiff.toLocaleString()}원 더 많습니다</span>.`
  } else if (expDiff < 0) {
    expText = `지출을 지난달보다 <span class="compare-tag decrease">${Math.abs(expDiff).toLocaleString()}원 절약했습니다</span>.`
  } else {
    expText = `지출이 지난달과 동일합니다.`
  }

  let netText = ''
  if (netDiff > 0) {
    netText = `잔여 현금흐름이 지난달보다 <span class="compare-tag income-up">+${netDiff.toLocaleString()}원 개선되었습니다</span>.`
  } else if (netDiff < 0) {
    netText = `잔여 현금흐름이 지난달보다 <span class="compare-tag income-down">-${Math.abs(netDiff).toLocaleString()}원 감소했습니다</span>.`
  } else {
    netText = `잔여 현금흐름이 지난달과 동일합니다.`
  }

  compareContent.innerHTML = `
    <div>• ${expText}</div>
    <div>• ${netText}</div>
  `
}

// 3. 내역 리스트 렌더링 (필터 적용 및 수정/삭제 버튼)
function renderRecordList() {
  const container = document.getElementById('record-container')

  const filtered = currentRecords.filter(item => {
    if (currentFilter === 'all') return true
    return item.type === currentFilter
  })

  if (filtered.length === 0) {
    container.innerHTML = `<p style="color: #94a3b8; text-align: center; padding: 24px 0;">등록된 내역이 없습니다.</p>`
    return
  }

  container.innerHTML = filtered.map(item => {
    const isIncome = item.type === 'income'
    const sign = isIncome ? '+' : '-'
    const badgeClass = isIncome ? 'income' : 'expense'
    const amountClass = isIncome ? 'income' : 'expense'

    return `
      <div class="record-item">
        <div class="record-left">
          <div class="record-badge ${badgeClass}">${isIncome ? '₩' : '−'}</div>
          <div class="record-texts">
            <span class="record-category">${escapeHtml(item.category)}</span>
            ${item.memo ? `<span class="record-memo">${escapeHtml(item.memo)}</span>` : ''}
          </div>
        </div>
        <div class="record-right">
          <span class="record-amount ${amountClass}">
            ${sign}${Number(item.amount).toLocaleString()}원
          </span>
          <div class="record-actions">
            <button onclick="window.openEditModal('${item.id}')" class="btn-edit-record" title="수정">
              <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <button onclick="window.handleDeleteRecord('${item.id}')" class="btn-delete-record" title="삭제">&times;</button>
          </div>
        </div>
      </div>
    `
  }).join('')
}

// HTML 이스케이프 유틸리티
function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// 4. 모달 저장 버튼 핸들러 (추가 또는 수정 분기)
async function submitRecord() {
  const categoryInput = document.getElementById('new-category')
  const amountInput = document.getElementById('new-amount')
  const memoInput = document.getElementById('new-memo')

  const category = categoryInput.value.trim()
  const amount = Number(amountInput.value)
  const memo = memoInput.value.trim()

  if (!category) {
    alert('항목 이름을 입력해주세요!')
    categoryInput.focus()
    return
  }

  if (isNaN(amount) || amount <= 0) {
    alert('올바른 금액을 입력해주세요!')
    amountInput.focus()
    return
  }

  if (editingRecordId) {
    // [수정 로직]
    try {
      const { error } = await supabase
        .from('monthly_records')
        .update({
          type: selectedType,
          category: category,
          amount: amount,
          memo: memo || null
        })
        .eq('id', editingRecordId)

      if (error) throw error

      closeModal()
      fetchMonthlyData()

    } catch (error) {
      console.error('내역 수정 실패:', error.message)
      alert('내역 수정 중 오류가 발생했습니다.')
    }
  } else {
    // [신규 추가 로직]
    const currentYM = getYearMonthString(currentDate)

    try {
      const { error } = await supabase
        .from('monthly_records')
        .insert([
          {
            year_month: currentYM,
            type: selectedType,
            category: category,
            amount: amount,
            memo: memo || null
          }
        ])

      if (error) throw error

      closeModal()
      fetchMonthlyData()

    } catch (error) {
      console.error('내역 추가 실패:', error.message)
      alert('내역 저장 중 오류가 발생했습니다.')
    }
  }
}

// 5. 내역 삭제
async function deleteRecord(id) {
  if (!confirm('이 내역을 삭제하시겠습니까?')) return

  try {
    const { error } = await supabase
      .from('monthly_records')
      .delete()
      .eq('id', id)

    if (error) throw error

    fetchMonthlyData()

  } catch (error) {
    console.error('내역 삭제 실패:', error.message)
    alert('내역 삭제 중 오류가 발생했습니다.')
  }
}

// 6. 월 이동 제어
function prevMonth() {
  currentDate.setMonth(currentDate.getMonth() - 1)
  fetchMonthlyData()
}

function nextMonth() {
  currentDate.setMonth(currentDate.getMonth() + 1)
  fetchMonthlyData()
}

function onMonthPickerChange(e) {
  const val = e.target.value // "YYYY-MM"
  if (!val) return
  const [year, month] = val.split('-').map(Number)
  currentDate = new Date(year, month - 1, 1)
  fetchMonthlyData()
}

// 7. 필터 변경 (전체/수입/지출)
function setFilter(filterType) {
  currentFilter = filterType
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active')
  })
  const activeBtn = document.getElementById(`filter-${filterType}`)
  if (activeBtn) activeBtn.classList.add('active')

  renderRecordList()
}

// ⚡ 8. 빠른 템플릿(퀵 칩) 렌더링 및 적용
function renderTemplateChips() {
  const container = document.getElementById('template-chips')
  if (!container) return

  const list = QUICK_TEMPLATES[selectedType] || []

  container.innerHTML = list.map(item => `
    <button type="button" class="template-chip" onclick="window.applyTemplate('${escapeHtml(item.name)}', ${item.amount}, this)">
      <span>${item.icon}</span>
      <span>${escapeHtml(item.name)}</span>
    </button>
  `).join('')
}

function applyTemplate(name, amount, btnElem) {
  const catInput = document.getElementById('new-category')
  const amtInput = document.getElementById('new-amount')

  if (catInput) catInput.value = name
  if (amtInput) {
    amtInput.value = amount
    amtInput.focus()
  }

  // 칩 활성화 스타일 표시
  document.querySelectorAll('.template-chip').forEach(c => c.classList.remove('active'))
  if (btnElem) btnElem.classList.add('active')
}

// 모달 수입/지출 타입 선택
function selectType(type) {
  selectedType = type
  const expenseBtn = document.getElementById('type-expense-btn')
  const incomeBtn = document.getElementById('type-income-btn')

  if (type === 'income') {
    incomeBtn.className = 'type-btn active income'
    expenseBtn.className = 'type-btn'
  } else {
    expenseBtn.className = 'type-btn active expense'
    incomeBtn.className = 'type-btn'
  }

  // 템플릿 칩 갱신
  renderTemplateChips()
}

// 신규 추가 모달 열기
function openModal() {
  editingRecordId = null
  document.getElementById('modal-title').textContent = '수입/지출 내역 추가'
  document.getElementById('modal-submit-btn').textContent = '추가'

  document.getElementById('new-category').value = ''
  document.getElementById('new-amount').value = ''
  document.getElementById('new-memo').value = ''

  selectType('expense') // 기본 지출 선택 및 템플릿 렌더링
  document.getElementById('add-modal').style.display = 'flex'
  document.getElementById('new-category').focus()
}

// 기존 내역 수정 모달 열기
function openEditModal(id) {
  const item = currentRecords.find(r => String(r.id) === String(id))
  if (!item) return

  editingRecordId = id
  document.getElementById('modal-title').textContent = '수입/지출 내역 수정'
  document.getElementById('modal-submit-btn').textContent = '수정 저장'

  document.getElementById('new-category').value = item.category || ''
  document.getElementById('new-amount').value = item.amount || ''
  document.getElementById('new-memo').value = item.memo || ''

  selectType(item.type || 'expense')
  document.getElementById('add-modal').style.display = 'flex'
  document.getElementById('new-category').focus()
}

function closeModal() {
  document.getElementById('add-modal').style.display = 'none'
  editingRecordId = null
}

// =======================================================
// 📋 9. 전달 내역 가져오기 (고정비/반복 내역 복사) 로직
// =======================================================

// 전달 내역 복사 모달 열기
async function openCopyModal() {
  const prevYM = getPrevYearMonthString(currentDate)
  const currentYM = getYearMonthString(currentDate)

  const subtitle = document.getElementById('copy-modal-subtitle')
  const listContainer = document.getElementById('copy-item-list')
  const checkAll = document.getElementById('copy-check-all')
  const submitBtn = document.getElementById('btn-submit-copy')
  const countBadge = document.getElementById('copy-selected-count')

  subtitle.textContent = `지난달(${prevYM}) 내역 중 이번 달(${currentYM})로 복사할 항목을 선택하세요.`
  listContainer.innerHTML = '<div style="text-align: center; padding: 24px 0; color: #94a3b8; font-size: 13px;">지난달 내역을 불러오는 중...</div>'
  document.getElementById('copy-modal').style.display = 'flex'

  try {
    const { data, error } = await supabase
      .from('monthly_records')
      .select('*')
      .eq('year_month', prevYM)
      .order('created_at', { ascending: true })

    if (error) throw error

    prevMonthRecordsCache = data || []

    if (prevMonthRecordsCache.length === 0) {
      listContainer.innerHTML = `<div style="text-align: center; padding: 36px 0; color: #94a3b8; font-size: 13px;">지난달(${prevYM})에 등록된 내역이 없습니다.</div>`
      checkAll.disabled = true
      checkAll.checked = false
      submitBtn.disabled = true
      submitBtn.textContent = '가져오기'
      countBadge.textContent = '0개 선택'
      return
    }

    checkAll.disabled = false
    checkAll.checked = true
    submitBtn.disabled = false

    // 이전 달 항목 렌더링 (기본 전체 체크)
    listContainer.innerHTML = prevMonthRecordsCache.map(item => {
      const isIncome = item.type === 'income'
      const badgeClass = isIncome ? 'income' : 'expense'
      const badgeText = isIncome ? '수입' : '지출'
      const sign = isIncome ? '+' : '-'

      return `
        <div class="copy-item-row" onclick="window.toggleCopyItemRow(event, '${item.id}')">
          <div class="copy-item-left">
            <input type="checkbox" class="copy-item-checkbox" value="${item.id}" checked onchange="window.updateCopyCount()">
            <div class="copy-item-info">
              <span class="copy-item-name">${escapeHtml(item.category)}</span>
              ${item.memo ? `<span class="copy-item-memo">${escapeHtml(item.memo)}</span>` : ''}
            </div>
          </div>
          <div class="copy-item-right">
            <span class="copy-item-badge ${badgeClass}">${badgeText}</span>
            <span class="copy-item-amount ${badgeClass}">${sign}${Number(item.amount).toLocaleString()}원</span>
          </div>
        </div>
      `
    }).join('')

    updateCopyCount()

  } catch (error) {
    console.error('전달 내역 조회 실패:', error.message)
    listContainer.innerHTML = '<div style="text-align: center; padding: 24px 0; color: #ef4444; font-size: 13px;">데이터를 불러오지 못했습니다.</div>'
  }
}

// 아이템 행 클릭 시 체크박스 토글
function toggleCopyItemRow(event, id) {
  // 체크박스 자체 클릭 시 중복 처리 방지
  if (event.target.classList.contains('copy-item-checkbox')) return

  const checkbox = document.querySelector(`.copy-item-checkbox[value="${id}"]`)
  if (checkbox) {
    checkbox.checked = !checkbox.checked
    updateCopyCount()
  }
}

// 전체 선택/해제 토글
function toggleAllCopyChecks(checked) {
  const checkboxes = document.querySelectorAll('.copy-item-checkbox')
  checkboxes.forEach(cb => {
    cb.checked = checked
  })
  updateCopyCount()
}

// 선택된 개수 및 버튼 텍스트 업데이트
function updateCopyCount() {
  const checkedBoxes = document.querySelectorAll('.copy-item-checkbox:checked')
  const allBoxes = document.querySelectorAll('.copy-item-checkbox')
  const count = checkedBoxes.length

  const countBadge = document.getElementById('copy-selected-count')
  const submitBtn = document.getElementById('btn-submit-copy')
  const checkAll = document.getElementById('copy-check-all')

  if (countBadge) countBadge.textContent = `${count}개 선택`
  if (submitBtn) {
    submitBtn.textContent = count > 0 ? `${count}개 내역 가져오기` : '가져오기'
    submitBtn.disabled = (count === 0)
  }

  if (checkAll && allBoxes.length > 0) {
    checkAll.checked = (checkedBoxes.length === allBoxes.length)
  }
}

// 선택한 내역 일괄 복사 (Bulk Insert)
async function handleCopyRecords() {
  const checkedBoxes = document.querySelectorAll('.copy-item-checkbox:checked')
  const selectedIds = Array.from(checkedBoxes).map(cb => cb.value)

  if (selectedIds.length === 0) {
    alert('가져올 내역을 1개 이상 선택해주세요!')
    return
  }

  const currentYM = getYearMonthString(currentDate)

  // 복사 대상 레코드 생성 (새로운 월 값 적용)
  const recordsToInsert = prevMonthRecordsCache
    .filter(r => selectedIds.includes(String(r.id)))
    .map(r => ({
      year_month: currentYM,
      type: r.type,
      category: r.category,
      amount: Number(r.amount),
      memo: r.memo || null
    }))

  const submitBtn = document.getElementById('btn-submit-copy')
  if (submitBtn) {
    submitBtn.disabled = true
    submitBtn.textContent = '가져오는 중...'
  }

  try {
    const { error } = await supabase
      .from('monthly_records')
      .insert(recordsToInsert)

    if (error) throw error

    closeCopyModal()
    fetchMonthlyData()

  } catch (error) {
    console.error('내역 복사 실패:', error.message)
    alert('내역을 가져오는 중 오류가 발생했습니다.')
    if (submitBtn) submitBtn.disabled = false
  }
}

function closeCopyModal() {
  document.getElementById('copy-modal').style.display = 'none'
  prevMonthRecordsCache = []
}

// 이벤트 리스너 등록
document.getElementById('btn-prev-month').addEventListener('click', prevMonth)
document.getElementById('btn-next-month').addEventListener('click', nextMonth)
document.getElementById('month-picker').addEventListener('change', onMonthPickerChange)

// 전역 함수 등록
window.openModal = openModal
window.openEditModal = openEditModal
window.closeModal = closeModal
window.handleSubmitRecord = submitRecord
window.handleAddRecord = submitRecord
window.handleDeleteRecord = deleteRecord
window.setFilter = setFilter
window.selectType = selectType
window.applyTemplate = applyTemplate

// 복사 관련 전역 함수 등록
window.openCopyModal = openCopyModal
window.closeCopyModal = closeCopyModal
window.toggleAllCopyChecks = toggleAllCopyChecks
window.toggleCopyItemRow = toggleCopyItemRow
window.updateCopyCount = updateCopyCount
window.handleCopyRecords = handleCopyRecords

// 초기 실행
fetchMonthlyData()
