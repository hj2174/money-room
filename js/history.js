import { supabase } from './supabaseClient.js'

// 현재 선택된 날짜 (기본값: 오늘)
let currentDate = new Date()
let currentFilter = 'all' // 'all', 'income', 'expense'
let selectedType = 'expense' // 모달 내 기본값: 지출
let currentRecords = []

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

    // 요약 계산
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

// 2. 상단 요약 및 지난달 비교 렌더링
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

// 3. 내역 리스트 렌더링 (필터 적용)
function renderRecordList() {
  const container = document.getElementById('record-container')

  const filtered = currentRecords.filter(item => {
    if (currentFilter === 'all') return true
    return item.type === currentFilter
  })

  if (filtered.length === 0) {
    container.innerHTML = `<p style="color: #9ca3af; text-align: center; padding: 24px 0;">등록된 내역이 없습니다.</p>`
    return
  }

  container.innerHTML = filtered.map(item => {
    const isIncome = item.type === 'income'
    const sign = isIncome ? '+' : '-'
    const badgeText = isIncome ? '수입' : '지출'
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
          <button onclick="window.handleDeleteRecord('${item.id}')" class="btn-delete-record" title="삭제">&times;</button>
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

// 4. 수입/지출 내역 추가
async function addRecord() {
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

    // 입력창 초기화 및 모달 닫기
    categoryInput.value = ''
    amountInput.value = ''
    memoInput.value = ''
    closeModal()

    // 데이터 갱신
    fetchMonthlyData()

  } catch (error) {
    console.error('내역 추가 실패:', error.message)
    alert('내역 저장 중 오류가 발생했습니다.')
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

// 8. 모달 및 수입/지출 타입 선택
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
}

function openModal() {
  selectType('expense') // 기본 지출 선택
  document.getElementById('add-modal').style.display = 'flex'
  document.getElementById('new-category').focus()
}

function closeModal() {
  document.getElementById('add-modal').style.display = 'none'
}

// 이벤트 리스너 등록
document.getElementById('btn-prev-month').addEventListener('click', prevMonth)
document.getElementById('btn-next-month').addEventListener('click', nextMonth)
document.getElementById('month-picker').addEventListener('change', onMonthPickerChange)

// 전역 함수 등록
window.handleAddRecord = addRecord
window.handleDeleteRecord = deleteRecord
window.setFilter = setFilter
window.selectType = selectType
window.openModal = openModal
window.closeModal = closeModal

// 초기 실행
fetchMonthlyData()
