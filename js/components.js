// js/components.js
// 🧭 머니룸 공통 컴포넌트: 상단 헤더 & 하단 고정 네비게이션 바 (JS 템플릿 리터럴)

// 1. 하단 네비게이션 아이템 정의
const NAV_ITEMS = [
  {
    id: 'assets',
    path: 'index.html',
    label: '자산/목표',
    icon: `<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`
  },
  {
    id: 'history',
    path: 'history.html',
    label: '월별 수지',
    icon: `<svg viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>`
  },
  {
    id: 'room',
    path: 'mineroom.html',
    label: '미니룸',
    icon: `<svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`
  }
]

// 2. 현재 활성화된 페이지 ID 판별 (파일명 기반 자동 매칭)
export function getActiveNavId() {
  const pathname = (typeof window !== 'undefined' && window.location.pathname ? window.location.pathname : '').toLowerCase()
  const filename = pathname.substring(pathname.lastIndexOf('/') + 1) || 'index.html'

  if (filename.includes('history')) return 'history'
  if (filename.includes('room') || filename.includes('mineroom')) return 'room'
  return 'assets' // index.html 또는 기본 메인
}

// 3. 상단 헤더 템플릿 리터럴 생성
export function getHeaderTemplate(activeId = getActiveNavId()) {
  const pageTitles = {
    assets: '자산/목표',
    history: '월별 수지',
    room: '미니룸'
  }
  const currentTitle = pageTitles[activeId] || '머니룸'

  return `
  
  `
}

// 4. 하단 네비게이션 바 템플릿 리터럴 생성 (현재 경로 기반 active 클래스 자동 적용)
export function getNavbarTemplate(activeId = getActiveNavId()) {
  return `
    <nav class="bottom-nav">
      ${NAV_ITEMS.map(item => `
        <a href="${item.path}" class="bottom-nav-item ${item.id === activeId ? 'active' : ''}">
          <span class="bottom-nav-icon">
            ${item.icon}
          </span>
          <span class="bottom-nav-label">${item.label}</span>
        </a>
      `).join('')}
    </nav>
  `
}

// 5. 각 컨테이너(#header-container, #navbar-container)에 공통 컴포넌트 렌더링
export function renderCommonComponents() {
  const activeId = getActiveNavId()

  // 상단 헤더 컨테이너 렌더링
  const headerContainer = document.getElementById('header-container')
  if (headerContainer) {
    headerContainer.innerHTML = getHeaderTemplate(activeId)
  }

  // 하단 네비게이션 바 컨테이너 렌더링
  const navbarContainer = document.getElementById('navbar-container')
  if (navbarContainer) {
    navbarContainer.innerHTML = getNavbarTemplate(activeId)
  }
}

// 6. DOM 준비 시 자동 실행
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderCommonComponents)
  } else {
    renderCommonComponents()
  }
}
