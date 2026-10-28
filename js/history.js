import { supabase } from './supabaseClient.js'

// 현재 선택된 날짜 (기본값: 오늘)
let currentDate = new Date()
let currentFilter = 'all' // 'all', 'income', 'expense'
let selectedType = 'expense' // 모달 내 기본값: 지출
let currentRecords = []
let availableAssetGoals = [] // 연동 가능한 자산 목표 목록 (budgets_and_categories)
let editingRecordId = null // 현재 수정 중인 레코드 ID (null이면 신규 추가)
let isChartDetailOpen = false // 카테고리별 지출 비중 상세 보기 토글 상태 (기본값: 접힘)
let currentTotalIncome = 0 // 당월 총 수입
let currentTotalExpense = 0 // 당월 총 지출 (소비성 지출)
let currentTotalTransfer = 0 // 당월 총 저금 (자산 이동)
let activeChartSegmentIndex = null // 현재 툴팁이 활성화된 차트 세그먼트 인덱스
let chartTooltipTimer = null // 차트 툴팁 자동 닫힘 타이머

// ⚡ 빠른 템플릿 기본 데이터셋 (초기값)
const DEFAULT_TEMPLATES = {
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
  ],
  transfer: [
    { name: '비상금 저금', amount: 100000, icon: '💳' },
    { name: '적금 납입', amount: 300000, icon: '🏦' },
    { name: '청년적금', amount: 500000, icon: '🌱' },
    { name: '투자금 이체', amount: 200000, icon: '📈' }
  ]
}

const TEMPLATE_STORAGE_KEY = 'moneyroom_quick_templates'

// 템플릿 불러오기 (localStorage)
function loadTemplates() {
  try {
    const saved = localStorage.getItem(TEMPLATE_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed.income && parsed.expense) {
        if (!parsed.transfer) {
          parsed.transfer = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES.transfer))
        }
        return parsed
      }
    }
  } catch (e) {
    console.warn('템플릿 로드 실패, 기본값 사용:', e)
  }
  return JSON.parse(JSON.stringify(DEFAULT_TEMPLATES))
}

// 템플릿 저장하기
function saveTemplates(templates) {
  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates))
  } catch (e) {
    console.error('템플릿 저장 실패:', e)
  }
}

let userTemplates = loadTemplates()
let currentTemplateTab = 'expense' // 템플릿 관리 모달 현재 탭 (expense / income / transfer)

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
    // 당월, 전월 데이터 및 자산 목표(budgets_and_categories) 동시 조회
    const [currentRes, prevRes, goalsRes] = await Promise.all([
      supabase
        .from('monthly_records')
        .select('*')
        .eq('year_month', currentYM)
        .order('created_at', { ascending: false }),
      supabase
        .from('monthly_records')
        .select('*')
        .eq('year_month', prevYM),
      supabase
        .from('budgets_and_categories')
        .select('*')
        .neq('category_name', '이번달 총 잔액')
        .order('id', { ascending: true })
    ])

    if (currentRes.error) throw currentRes.error
    if (prevRes.error) throw prevRes.error

    currentRecords = currentRes.data || []
    const prevRecords = prevRes.data || []
    if (!goalsRes.error && goalsRes.data) {
      availableAssetGoals = goalsRes.data
    }

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
  // 당월 집계 (소비 지출: expense만 포함, 저금 transfer는 소비 지출에서 제외)
  const curIncome = curRecords
    .filter(r => r.type === 'income')
    .reduce((sum, r) => sum + Number(r.amount), 0)

  const curExpense = curRecords
    .filter(r => r.type === 'expense')
    .reduce((sum, r) => sum + Number(r.amount), 0)

  const curTransfer = curRecords
    .filter(r => r.type === 'transfer')
    .reduce((sum, r) => sum + Number(r.amount), 0)

  const curNet = curIncome - curExpense

  // 전역 당월 집계 저장 (탭별 상단 요약 카드 렌더링에 사용)
  currentTotalIncome = curIncome
  currentTotalExpense = curExpense
  currentTotalTransfer = curTransfer

  // 전월 집계
  const prevIncome = prevRecords
    .filter(r => r.type === 'income')
    .reduce((sum, r) => sum + Number(r.amount), 0)

  const prevExpense = prevRecords
    .filter(r => r.type === 'expense')
    .reduce((sum, r) => sum + Number(r.amount), 0)

  const prevNet = prevIncome - prevExpense

  // UI 바인딩: 요약 박스 (이달의 잔여 현금 흐름)
  const summaryBox = document.getElementById('flow-summary-box')
  const netElem = document.getElementById('net-amount')

  if (netElem) {
    netElem.textContent = `${curNet >= 0 ? '+' : ''}${curNet.toLocaleString()}원`
  }

  if (summaryBox) {
    if (curNet < 0) {
      summaryBox.classList.add('negative')
    } else {
      summaryBox.classList.remove('negative')
    }
  }

  // 지난달 비교 렌더링
  renderComparison(curIncome, curExpense, curNet, prevIncome, prevExpense, prevNet, prevRecords.length > 0)

  // 📊 카테고리별 지출 비중 도넛 차트 렌더링
  renderExpenseChart(curRecords)
}

// 📊 카테고리별 지출 비중 상세 보기 토글 (그래프만 보기 <-> 상세 내역 펼치기)
function toggleChartDetail() {
  isChartDetailOpen = !isChartDetailOpen
  const legendElem = document.getElementById('chart-legend-container')
  const toggleBtn = document.getElementById('btn-toggle-chart-detail')

  if (legendElem) {
    if (isChartDetailOpen) {
      legendElem.classList.add('open')
    } else {
      legendElem.classList.remove('open')
    }
  }

  if (toggleBtn) {
    if (isChartDetailOpen) {
      toggleBtn.classList.add('active')
      const span = toggleBtn.querySelector('span')
      if (span) span.textContent = '닫기'
    } else {
      toggleBtn.classList.remove('active')
      const span = toggleBtn.querySelector('span')
      if (span) span.textContent = '상세'
    }
  }
}

// 📊 카테고리별 지출 비중 둥근 도넛 차트 렌더링 (SVG 및 모바일 툴팁 인터랙션 지원)
function renderExpenseChart(curRecords) {
  const graphWrap = document.getElementById('chart-graph-wrap')
  const legendContainer = document.getElementById('chart-legend-container')
  const toggleBtn = document.getElementById('btn-toggle-chart-detail')
  if (!graphWrap) return

  // 기존 툴팁 타이머 해제
  if (chartTooltipTimer) {
    clearTimeout(chartTooltipTimer)
    chartTooltipTimer = null
  }
  activeChartSegmentIndex = null

  const expenseRecords = curRecords.filter(r => r.type === 'expense')
  const totalExp = expenseRecords.reduce((sum, r) => sum + Number(r.amount), 0)

  if (expenseRecords.length === 0 || totalExp === 0) {
    graphWrap.innerHTML = '<div class="chart-empty-message">지출 내역 없음</div>'
    if (legendContainer) {
      legendContainer.innerHTML = ''
      legendContainer.classList.remove('open')
    }
    if (toggleBtn) toggleBtn.style.display = 'none'
    return
  }

  if (toggleBtn) toggleBtn.style.display = 'inline-flex'

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

  // SVG 도넛 차트 세그먼트 생성 (반지름: 35, 둘레: ~219.91)
  const radius = 35
  const circumference = 2 * Math.PI * radius
  let accumulatedDash = 0

  const svgSegments = sortedCats.map((item, idx) => {
    const color = CHART_COLORS[idx % CHART_COLORS.length]
    const ratio = item.amount / totalExp
    const dash = circumference * ratio
    const offset = -accumulatedDash
    accumulatedDash += dash

    return `
      <circle 
        class="donut-segment" 
        data-index="${idx}"
        cx="50" cy="50" r="${radius}"
        fill="transparent"
        stroke="${color}"
        stroke-width="16"
        stroke-dasharray="${dash} ${circumference}"
        stroke-dashoffset="${offset}"
        role="button"
        tabindex="0"
        aria-label="${escapeHtml(item.category)}: ${item.amount.toLocaleString()}원 (${item.percent}%)"
      />
    `
  }).join('')

  // 간결한 금액 표기 (예: 15만, 5,000원)
  const shortTotal = totalExp >= 10000 
    ? `${Math.round(totalExp / 10000).toLocaleString()}만` 
    : `${totalExp.toLocaleString()}원`

  // 1. 도넛 차트 및 말풍선 툴팁 렌더링
  graphWrap.innerHTML = `
    <div class="donut-chart-wrap" id="donut-chart-wrap">
      <div id="chart-tooltip" class="chart-tooltip" role="tooltip" aria-hidden="true">
        <span class="tooltip-cat"></span>
        <span class="tooltip-val"></span>
      </div>
      <svg class="donut-chart-svg" viewBox="0 0 100 100">
        ${svgSegments}
      </svg>
      <div class="donut-hole">
        <span class="donut-hole-label">총 지출</span>
        <span class="donut-hole-value">${shortTotal}</span>
      </div>
    </div>
  `

  // 2. 도넛 조각 클릭/터치 이벤트 바인딩
  attachChartInteractions(sortedCats)

  // 3. 상세 보기 클릭 시 펼쳐지는 카테고리 목록 렌더링 (하단 전체 폭)
  if (legendContainer) {
    legendContainer.innerHTML = sortedCats.map((item, idx) => {
      const color = CHART_COLORS[idx % CHART_COLORS.length]
      return `
        <div class="legend-item" data-legend-index="${idx}">
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
    }).join('')

    if (isChartDetailOpen) {
      legendContainer.classList.add('open')
    } else {
      legendContainer.classList.remove('open')
    }
  }

  // 토글 버튼 상태 동기화
  if (toggleBtn) {
    if (isChartDetailOpen) {
      toggleBtn.classList.add('active')
      const span = toggleBtn.querySelector('span')
      if (span) span.textContent = '닫기'
    } else {
      toggleBtn.classList.remove('active')
      const span = toggleBtn.querySelector('span')
      if (span) span.textContent = '상세'
    }
  }
}

// 📊 차트 조각 클릭(터치) 말풍선 툴팁 인터랙션 바인딩
function attachChartInteractions(sortedCats) {
  const chartWrap = document.getElementById('donut-chart-wrap')
  const tooltip = document.getElementById('chart-tooltip')
  if (!chartWrap || !tooltip) return

  const svg = chartWrap.querySelector('.donut-chart-svg')
  const segments = chartWrap.querySelectorAll('.donut-segment')

  function hideTooltip() {
    if (chartTooltipTimer) {
      clearTimeout(chartTooltipTimer)
      chartTooltipTimer = null
    }
    activeChartSegmentIndex = null
    tooltip.classList.remove('show')
    tooltip.setAttribute('aria-hidden', 'true')
    if (svg) svg.classList.remove('has-active')
    segments.forEach(seg => seg.classList.remove('active'))
  }

  function showTooltip(index, item) {
    if (chartTooltipTimer) {
      clearTimeout(chartTooltipTimer)
      chartTooltipTimer = null
    }

    activeChartSegmentIndex = index
    if (svg) svg.classList.add('has-active')

    segments.forEach((seg, i) => {
      if (i === index) {
        seg.classList.add('active')
      } else {
        seg.classList.remove('active')
      }
    })

    const catElem = tooltip.querySelector('.tooltip-cat')
    const valElem = tooltip.querySelector('.tooltip-val')
    if (catElem) catElem.textContent = item.category
    if (valElem) valElem.textContent = `${item.percent}%`

    tooltip.classList.add('show')
    tooltip.setAttribute('aria-hidden', 'false')

    // 3.5초 뒤 자동 숨김
    chartTooltipTimer = setTimeout(() => {
      hideTooltip()
    }, 3500)
  }

  // 각 조각에 클릭/터치 이벤트 등록
  segments.forEach((seg, idx) => {
    const item = sortedCats[idx]
    if (!item) return

    const handleAction = (e) => {
      e.stopPropagation()
      if (activeChartSegmentIndex === idx) {
        hideTooltip() // 같은 조각 클릭 시 토글 닫기
      } else {
        showTooltip(idx, item)
      }
    }

    seg.addEventListener('click', handleAction)
  })

  // 하단 상세 범례 목록 클릭/터치 시에도 툴팁 동기화 연동
  const legendItems = document.querySelectorAll('.legend-item')
  legendItems.forEach(elem => {
    const idx = Number(elem.getAttribute('data-legend-index'))
    const item = sortedCats[idx]
    if (!item) return

    elem.style.cursor = 'pointer'
    elem.addEventListener('click', (e) => {
      e.stopPropagation()
      if (activeChartSegmentIndex === idx) {
        hideTooltip()
      } else {
        showTooltip(idx, item)
      }
    })
  })

  // 툴팁 클릭 시에도 닫기
  tooltip.addEventListener('click', (e) => {
    e.stopPropagation()
    hideTooltip()
  })

  // 외부 클릭 시 툴팁 닫기
  if (window._chartTooltipDocClick) {
    document.removeEventListener('click', window._chartTooltipDocClick)
  }
  window._chartTooltipDocClick = (e) => {
    if (!chartWrap.contains(e.target) && !e.target.closest('.legend-item')) {
      hideTooltip()
    }
  }
  document.addEventListener('click', window._chartTooltipDocClick)
}

// 지난달 비교 뷰 렌더링 (간략한 평어/대시보드형 문구)
function renderComparison(curInc, curExp, curNet, prevInc, prevExp, prevNet, hasPrevData) {
  const compareContent = document.getElementById('compare-content')

  if (!hasPrevData) {
    compareContent.innerHTML = `<span style="color: #94a3b8;">지난달 등록 내역 없음</span>`
    return
  }

  // 지출 차이 (당월 - 전월)
  const expDiff = curExp - prevExp
  // 잔여 현금흐름 차이 (당월 - 전월)
  const netDiff = curNet - prevNet

  let expText = ''
  if (expDiff > 0) {
    expText = `지출 <span class="compare-tag increase">+${expDiff.toLocaleString()}원 증가</span>`
  } else if (expDiff < 0) {
    expText = `지출 <span class="compare-tag decrease">-${Math.abs(expDiff).toLocaleString()}원 절약</span>`
  } else {
    expText = `지출 변동 없음`
  }

  let netText = ''
  if (netDiff > 0) {
    netText = `현금흐름 <span class="compare-tag income-up">+${netDiff.toLocaleString()}원 개선</span>`
  } else if (netDiff < 0) {
    netText = `현금흐름 <span class="compare-tag income-down">-${Math.abs(netDiff).toLocaleString()}원 감소</span>`
  } else {
    netText = `현금흐름 변동 없음`
  }

  compareContent.innerHTML = `
    <div>• ${expText}</div>
    <div>• ${netText}</div>
  `
}

// 🎯 메모 문자열에서 기존 목표 연동 태그([🎯목표명], [목표:목표명] 등)를 모두 제거하고 순수 메모만 반환
function stripGoalTags(memo) {
  if (!memo) return ''
  return memo
    .replace(/\[(?:목표|🎯):?[^\]]+\]/g, '')
    .trim()
    .replace(/\s{2,}/g, ' ')
}

// 🎯 레코드가 어떤 자산 목표와 연동되어 있는지 확인 (메모 태그 [🎯목표명] 또는 [목표:목표명] 또는 카테고리 일치)
function getLinkedGoal(record) {
  if (!record || availableAssetGoals.length === 0) return null
  const memo = (record.memo || '').trim()
  const tagMatch = memo.match(/\[(?:목표|🎯):?([^\]]+)\]/)
  if (tagMatch) {
    const goalName = tagMatch[1].trim()
    const found = availableAssetGoals.find(g => g.category_name.trim() === goalName)
    if (found) return found
  }
  const cat = (record.category || '').trim()
  return availableAssetGoals.find(g => g.category_name.trim() === cat) || null
}

// 🎯 자산 목표 연동 드롭다운 옵션 채우기
function populateTargetLinkDropdown(selectedGoalName = '') {
  const select = document.getElementById('target-link-select')
  if (!select) return

  let html = '<option value="">-- 연동 안 함 (일반 생활 내역) --</option>'
  availableAssetGoals.forEach(g => {
    const isSel = (g.category_name.trim() === selectedGoalName.trim()) ? 'selected' : ''
    html += `<option value="${escapeHtml(g.category_name)}" ${isSel}>🎯 [${escapeHtml(g.category_name)}] 목표 연동</option>`
  })
  select.innerHTML = html
  updateTargetLinkTip(select.value)
}

// 자산 목표 드롭다운 선택 시 카테고리 자동 설정 및 안내 문구 갱신
function handleTargetLinkChange(val) {
  const catInput = document.getElementById('new-category')
  if (val && catInput) {
    const curVal = catInput.value.trim()
    if (!curVal || availableAssetGoals.some(g => g.category_name === curVal)) {
      catInput.value = val
    }
  }
  updateTargetLinkTip(val)
}

// 안내 팁 업데이트
function updateTargetLinkTip(val) {
  const tip = document.getElementById('asset-link-tip')
  if (!tip) return
  if (!val) {
    if (selectedType === 'transfer') {
      tip.innerHTML = `💡 <strong>저금 안내</strong>: 입금할 목표 카드를 선택하면 대시보드의 해당 목표 모금액으로 자동 적립됩니다.`
      tip.classList.add('active')
    } else {
      tip.innerHTML = ''
      tip.classList.remove('active')
    }
    return
  }
  tip.classList.add('active')
  if (selectedType === 'transfer') {
    tip.innerHTML = `💎 <strong>저금 (자산 이동)</strong>: 소비성 지출에서 제외되며, 대시보드 [<strong>${escapeHtml(val)}</strong>] 목표의 모금액(+)으로 자동 적립됩니다.`
  } else if (selectedType === 'expense') {
    tip.innerHTML = `💎 <strong>저축성 지출</strong>: 총자산 내에서 [<strong>${escapeHtml(val)}</strong>] 목표의 모금액으로 자동 적립됩니다.`
  } else {
    tip.innerHTML = `💎 <strong>목표 수입</strong>: [<strong>${escapeHtml(val)}</strong>] 목표의 모금액에 직접 추가됩니다.`
  }
}

// 3. 내역 리스트 렌더링 (필터별 상단 요약 카드 고정 + 내역 리스트)
function renderRecordList() {
  const container = document.getElementById('record-container')
  if (!container) return

  // 1) 탭에 따른 상단 요약 카드 HTML 생성 (내역 리스트와 동일한 카드 형태, 색상만 다르게)
  const incomeSummaryCardHtml = `
    <div class="record-item summary-card summary-income">
      <div class="record-left">
        <div class="record-badge income">₩</div>
        <div class="record-texts">
          <span class="record-category">총 수입</span>
          <span class="record-memo">이번 달 총 수입 합계</span>
        </div>
      </div>
      <div class="record-right">
        <span class="record-amount income">+${currentTotalIncome.toLocaleString()}원</span>
      </div>
    </div>
  `

  const expenseSummaryCardHtml = `
    <div class="record-item summary-card summary-expense">
      <div class="record-left">
        <div class="record-badge expense">−</div>
        <div class="record-texts">
          <span class="record-category">총 지출</span>
          <span class="record-memo">이번 달 총 소비 지출</span>
        </div>
      </div>
      <div class="record-right">
        <span class="record-amount expense">-${currentTotalExpense.toLocaleString()}원</span>
      </div>
    </div>
  `

  const transferSummaryCardHtml = `
    <div class="record-item summary-card summary-transfer">
      <div class="record-left">
        <div class="record-badge transfer">⇄</div>
        <div class="record-texts">
          <span class="record-category">총 저금</span>
          <span class="record-memo">이번 달 자산 이동 합계</span>
        </div>
      </div>
      <div class="record-right">
        <span class="record-amount transfer">${currentTotalTransfer.toLocaleString()}원</span>
      </div>
    </div>
  `

  let summaryHtml = ''
  if (currentFilter === 'all') {
    summaryHtml = incomeSummaryCardHtml + expenseSummaryCardHtml + (currentTotalTransfer > 0 ? transferSummaryCardHtml : '')
  } else if (currentFilter === 'income') {
    summaryHtml = incomeSummaryCardHtml
  } else if (currentFilter === 'expense') {
    summaryHtml = expenseSummaryCardHtml
  } else if (currentFilter === 'transfer') {
    summaryHtml = transferSummaryCardHtml
  }

  // 2) 필터링된 내역 항목 HTML 생성
  const filtered = currentRecords.filter(item => {
    if (currentFilter === 'all') return true
    return item.type === currentFilter
  })

  let listHtml = ''
  if (filtered.length === 0) {
    listHtml = `<p class="record-empty-message">등록된 내역이 없습니다.</p>`
  } else {
    listHtml = filtered.map(item => {
      const isIncome = item.type === 'income'
      const isTransfer = item.type === 'transfer'
      const sign = isIncome ? '+' : (isTransfer ? '⇄ ' : '-')
      const badgeChar = isIncome ? '₩' : (isTransfer ? '⇄' : '−')
      const badgeClass = isIncome ? 'income' : (isTransfer ? 'transfer' : 'expense')
      const amountClass = isIncome ? 'income' : (isTransfer ? 'transfer' : 'expense')
      const linkedGoal = getLinkedGoal(item)
      const displayMemo = stripGoalTags(item.memo)
      const linkBadgeHtml = linkedGoal ? `
        <span class="badge-asset-link">
          <svg class="icon-asset-link" viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
          ${escapeHtml(linkedGoal.category_name)}
        </span>
      ` : ''

      return `
        <div class="record-item">
          <div class="record-left">
            <div class="record-badge ${badgeClass}">${badgeChar}</div>
            <div class="record-texts">
              <span class="record-category">${escapeHtml(item.category)}</span>
              ${linkBadgeHtml}
              ${displayMemo ? `<span class="record-memo">${escapeHtml(displayMemo)}</span>` : ''}
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

  // 상단 요약 카드 + 내역 리스트 함께 바인딩
  container.innerHTML = summaryHtml + listHtml
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

// 4. 모달 저장 버튼 핸들러 (추가 또는 수정 분기 및 자산 목표 자동 연동)
async function submitRecord() {
  const categoryInput = document.getElementById('new-category')
  const amountInput = document.getElementById('new-amount')
  const memoInput = document.getElementById('new-memo')
  const targetSelect = document.getElementById('target-link-select')

  const category = categoryInput.value.trim()
  const amount = Number(amountInput.value)
  let memo = memoInput.value.trim()
  const selectedGoalName = targetSelect ? targetSelect.value.trim() : ''

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

  // 1. 순수 사용자 메모 추출 (이전 연동 태그를 완전히 제거하여 단 1개의 연동만 보장)
  const pureMemo = stripGoalTags(memoInput.value)

  // 2. 단일 자산 목표 식별
  let linkedGoal = null
  if (selectedGoalName) {
    linkedGoal = availableAssetGoals.find(g => g.category_name.trim() === selectedGoalName) || null
  } else if (!editingRecordId) {
    // 신규 등록 시에만 카테고리명과 일치하는 목표가 있다면 자동 매칭
    // (수정 시에는 사용자가 '-- 연동 안 함 --'을 선택했을 때 연동을 해제할 수 있도록 함)
    linkedGoal = availableAssetGoals.find(g => g.category_name.trim() === category) || null
  }

  // 3. 메모에 오직 1개의 목표 연동 태그만 부착 (연동이 없으면 순수 메모만 유지)
  let finalMemo = pureMemo
  if (linkedGoal) {
    const tag = `[🎯${linkedGoal.category_name}]`
    finalMemo = pureMemo ? `${pureMemo} ${tag}` : tag
  }

  if (editingRecordId) {
    // [수정 로직]
    try {
      const oldRecord = currentRecords.find(r => String(r.id) === String(editingRecordId))
      const oldLinkedGoal = oldRecord ? getLinkedGoal(oldRecord) : null

      // 1. 기존 연동 목표 금액 롤백
      if (oldLinkedGoal) {
        const rollbackAmount = Math.max(0, Number(oldLinkedGoal.current_amount) - Number(oldRecord.amount))
        await supabase
          .from('budgets_and_categories')
          .update({ current_amount: rollbackAmount })
          .eq('id', oldLinkedGoal.id)
        oldLinkedGoal.current_amount = rollbackAmount
      }

      // 2. 새 연동 목표 금액 적용 (저축성 지출 및 목표 수입 반영)
      if (linkedGoal) {
        const targetGoalInCache = availableAssetGoals.find(g => g.id === linkedGoal.id) || linkedGoal
        const newGoalAmount = Number(targetGoalInCache.current_amount) + amount
        await supabase
          .from('budgets_and_categories')
          .update({ current_amount: newGoalAmount })
          .eq('id', targetGoalInCache.id)
        targetGoalInCache.current_amount = newGoalAmount
      }

      // 3. 내역 업데이트
      const { error } = await supabase
        .from('monthly_records')
        .update({
          type: selectedType,
          category: category,
          amount: amount,
          memo: finalMemo || null
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
      // 1. 자산 목표 연동 시 해당 목표의 current_amount 증가 (저축성 지출/적립)
      if (linkedGoal) {
        const targetGoalInCache = availableAssetGoals.find(g => g.id === linkedGoal.id) || linkedGoal
        const newGoalAmount = Number(targetGoalInCache.current_amount) + amount
        const { error: goalErr } = await supabase
          .from('budgets_and_categories')
          .update({ current_amount: newGoalAmount })
          .eq('id', targetGoalInCache.id)

        if (goalErr) console.warn('목표 금액 연동 업데이트 경고:', goalErr.message)
        else targetGoalInCache.current_amount = newGoalAmount
      }

      // 2. 내역 추가
      const { error } = await supabase
        .from('monthly_records')
        .insert([
          {
            year_month: currentYM,
            type: selectedType,
            category: category,
            amount: amount,
            memo: finalMemo || null
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
    const targetRecord = currentRecords.find(r => String(r.id) === String(id))
    const linkedGoal = targetRecord ? getLinkedGoal(targetRecord) : null

    // 연동된 목표가 있다면 금액 롤백
    if (linkedGoal) {
      const rollbackAmount = Math.max(0, Number(linkedGoal.current_amount) - Number(targetRecord.amount))
      await supabase
        .from('budgets_and_categories')
        .update({ current_amount: rollbackAmount })
        .eq('id', linkedGoal.id)
      linkedGoal.current_amount = rollbackAmount
    }

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

  const list = (userTemplates && userTemplates[selectedType]) || []

  container.innerHTML = list.map(item => `
    <button type="button" class="template-chip" onclick="window.applyTemplate('${escapeHtml(item.name)}', ${item.amount}, this)">
      <span>${item.icon || '📌'}</span>
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

  // 자산 목표 일치 여부 확인 후 드롭다운 자동 동기화
  const select = document.getElementById('target-link-select')
  if (select) {
    const matched = availableAssetGoals.find(g => g.category_name.trim() === name.trim())
    if (matched) {
      select.value = matched.category_name
      updateTargetLinkTip(matched.category_name)
    } else {
      select.value = ''
      updateTargetLinkTip('')
    }
  }

  // 칩 활성화 스타일 표시
  document.querySelectorAll('.template-chip').forEach(c => c.classList.remove('active'))
  if (btnElem) btnElem.classList.add('active')
}

// 모달 수입/지출/저금·이체 타입 선택
function selectType(type) {
  selectedType = type
  const expenseBtn = document.getElementById('type-expense-btn')
  const incomeBtn = document.getElementById('type-income-btn')
  const transferBtn = document.getElementById('type-transfer-btn')

  if (expenseBtn) expenseBtn.className = (type === 'expense') ? 'type-btn active expense' : 'type-btn'
  if (incomeBtn) incomeBtn.className = (type === 'income') ? 'type-btn active income' : 'type-btn'
  if (transferBtn) transferBtn.className = (type === 'transfer') ? 'type-btn active transfer' : 'type-btn'

  const select = document.getElementById('target-link-select')
  if (select) {
    updateTargetLinkTip(select.value)
  }

  // 템플릿 칩 갱신
  renderTemplateChips()
}

// 신규 추가 모달 열기
function openModal() {
  editingRecordId = null
  document.getElementById('modal-title').textContent = '내역 추가'
  document.getElementById('modal-submit-btn').textContent = '추가'

  document.getElementById('new-category').value = ''
  document.getElementById('new-amount').value = ''
  document.getElementById('new-memo').value = ''

  populateTargetLinkDropdown('')
  selectType('expense') // 기본 지출 선택 및 템플릿 렌더링
  document.getElementById('add-modal').style.display = 'flex'
  document.getElementById('new-category').focus()
}

// 기존 내역 수정 모달 열기
function openEditModal(id) {
  const item = currentRecords.find(r => String(r.id) === String(id))
  if (!item) return

  editingRecordId = id
  document.getElementById('modal-title').textContent = '내역 수정'
  document.getElementById('modal-submit-btn').textContent = '수정 저장'

  document.getElementById('new-category').value = item.category || ''
  document.getElementById('new-amount').value = item.amount || ''
  document.getElementById('new-memo').value = stripGoalTags(item.memo || '')

  const linked = getLinkedGoal(item)
  populateTargetLinkDropdown(linked ? linked.category_name : '')
  selectType(item.type || 'expense')
  document.getElementById('add-modal').style.display = 'flex'
  document.getElementById('new-category').focus()
}

function closeModal() {
  document.getElementById('add-modal').style.display = 'none'
  editingRecordId = null
}

// =======================================================
// ⚙️ 9. 빠른 템플릿 관리(직접 추가/삭제/초기화) 로직
// =======================================================

// 템플릿 관리 모달 열기
function openTemplateManager() {
  currentTemplateTab = selectedType || 'expense'
  switchTemplateTab(currentTemplateTab)
  document.getElementById('template-manage-modal').style.display = 'flex'
}

// 템플릿 관리 모달 닫기
function closeTemplateManager() {
  document.getElementById('template-manage-modal').style.display = 'none'
  renderTemplateChips() // 메인 모달의 칩 목록 동기화
}

// 템플릿 탭 전환 (지출/수입/저금·이체)
function switchTemplateTab(type) {
  currentTemplateTab = type
  const tabExpense = document.getElementById('tmpl-tab-expense')
  const tabIncome = document.getElementById('tmpl-tab-income')
  const tabTransfer = document.getElementById('tmpl-tab-transfer')

  if (tabExpense) tabExpense.className = (type === 'expense') ? 'type-btn active expense' : 'type-btn'
  if (tabIncome) tabIncome.className = (type === 'income') ? 'type-btn active income' : 'type-btn'
  if (tabTransfer) tabTransfer.className = (type === 'transfer') ? 'type-btn active transfer' : 'type-btn'

  renderTemplateManagerList()
}

// 템플릿 관리 목록 렌더링
function renderTemplateManagerList() {
  const container = document.getElementById('template-manage-list')
  if (!container) return

  const list = (userTemplates && userTemplates[currentTemplateTab]) || []

  if (list.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 24px 0; color: #94a3b8; font-size: 13px;">등록된 템플릿이 없습니다. 위에서 새 항목을 추가해보세요.</div>'
    return
  }

  container.innerHTML = list.map((item, index) => {
    const isIncome = currentTemplateTab === 'income'
    const isTransfer = currentTemplateTab === 'transfer'
    const colorClass = isIncome ? 'income' : (isTransfer ? 'transfer' : 'expense')
    return `
      <div class="template-manage-item">
        <div class="template-item-left">
          <span class="template-item-icon">${item.icon || '📌'}</span>
          <span class="template-item-name">${escapeHtml(item.name)}</span>
        </div>
        <div class="template-item-right">
          <span class="template-item-amount ${colorClass}">${Number(item.amount || 0).toLocaleString()}원</span>
          <button type="button" class="btn-delete-template" onclick="window.handleDeleteTemplate(${index})" title="삭제">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </div>
    `
  }).join('')
}

// 신규 템플릿 추가
function handleAddNewTemplate() {
  const iconInput = document.getElementById('tmpl-input-icon')
  const nameInput = document.getElementById('tmpl-input-name')
  const amountInput = document.getElementById('tmpl-input-amount')

  const defaultIcon = currentTemplateTab === 'income' ? '💰' : (currentTemplateTab === 'transfer' ? '🏦' : '💸')
  const icon = (iconInput?.value || '').trim() || defaultIcon
  const name = (nameInput?.value || '').trim()
  const amount = Number(amountInput?.value) || 0

  if (!name) {
    alert('항목 이름을 입력해주세요!')
    nameInput?.focus()
    return
  }

  if (!userTemplates[currentTemplateTab]) {
    userTemplates[currentTemplateTab] = []
  }

  userTemplates[currentTemplateTab].push({
    name,
    amount,
    icon
  })

  saveTemplates(userTemplates)

  // 입력 폼 초기화
  if (nameInput) nameInput.value = ''
  if (amountInput) amountInput.value = ''

  renderTemplateManagerList()
  renderTemplateChips()
}

// 템플릿 삭제
function handleDeleteTemplate(index) {
  if (!userTemplates[currentTemplateTab] || !userTemplates[currentTemplateTab][index]) return

  const item = userTemplates[currentTemplateTab][index]
  if (!confirm(`'${item.name}' 템플릿을 삭제하시겠습니까?`)) return

  userTemplates[currentTemplateTab].splice(index, 1)
  saveTemplates(userTemplates)

  renderTemplateManagerList()
  renderTemplateChips()
}

// 템플릿 기본값 초기화
function handleResetTemplates() {
  if (!confirm('기본 템플릿 목록으로 초기화하시겠습니까? 직접 추가한 항목이 삭제될 수 있습니다.')) return

  userTemplates = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES))
  saveTemplates(userTemplates)

  renderTemplateManagerList()
  renderTemplateChips()
}

// 이벤트 리스너 등록
document.getElementById('btn-prev-month').addEventListener('click', prevMonth)
document.getElementById('btn-next-month').addEventListener('click', nextMonth)
document.getElementById('month-picker').addEventListener('change', onMonthPickerChange)

// 카테고리 직접 입력 시 자산 목표 자동 매칭 이벤트
document.getElementById('new-category')?.addEventListener('input', (e) => {
  const val = (e.target.value || '').trim()
  const select = document.getElementById('target-link-select')
  if (select && val) {
    const matched = availableAssetGoals.find(g => g.category_name.trim() === val)
    if (matched && select.value !== matched.category_name) {
      select.value = matched.category_name
      updateTargetLinkTip(matched.category_name)
    }
  }
})

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
window.toggleChartDetail = toggleChartDetail
window.handleTargetLinkChange = handleTargetLinkChange

// 템플릿 관리 관련 전역 함수 등록
window.openTemplateManager = openTemplateManager
window.closeTemplateManager = closeTemplateManager
window.switchTemplateTab = switchTemplateTab
window.handleAddNewTemplate = handleAddNewTemplate
window.handleDeleteTemplate = handleDeleteTemplate
window.handleResetTemplates = handleResetTemplates

// 초기 실행
fetchMonthlyData()
