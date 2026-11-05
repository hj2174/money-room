# 프로젝트 통합 개발 지침 (Project Development Guidelines)

이 문서는 프로젝트의 성공적이고 안정적인 개발을 위한 기술 환경, 코딩 표준, 그리고 핵심 개발 원칙을 정의합니다.

## 1. 프로젝트 환경 및 코딩 표준
rooms.tier는 사용하지 않는다. 방 크기는 space_type별 고정값.
### 1.1. 개발 환경
| 항목 | 내용 |
|------|------|
| 언어 | Java 1.8 |
| 프레임워크 | JSP, Servlet |
| 데이터베이스 | MySQL 5.6 |
| ORM | ActiveJDBC |
| Layout | Velocity 1.7 |
| 인코딩 | UTF-8 |
| 버전 관리 | SVN (커밋/업데이트 시 충돌에 주의) |

### 1.2. 기본 코딩 규칙
* **언어 및 문법**: Java 8 문법을 준수하며, 변수명과 메서드명은 `camelCase`를 사용합니다.
* **주석**: 모든 주석은 **한국어**로 작성하여 팀원 간의 가독성을 높입니다.
* **의존성**: 외부 라이브러리 추가가 필요한 경우, 반드시 사전에 협의하고 확인합니다.

### 1.3. SVN 형상 관리 규칙 (SVN Change Management)
* **신규 파일 생성 시**: 신규 파일 또는 디렉터리를 생성했을 때는 작업 완료 후 즉시 `svn add {파일경로}`를 실행하여 SVN 추가 예약(`A`) 상태로 등록합니다.
* **파일 삭제 시**: 파일을 삭제할 때는 즉시 `svn delete {파일경로}`(또는 `svn rm`)를 실행하여 SVN 삭제 예약(`D`) 상태로 등록합니다.
* **이동 및 이름 변경 시**: 파일명을 바꾸거나 경로를 이동할 때는 `svn move {이전자원} {새자원}`을 사용하여 변경 이력을 보존합니다.
* **임시 파일 커밋 방지**: 로그, 컴파일 산출물, 임시 스크립트 등 버전 관리 대상이 아닌 파일은 커밋 대상에 포함되지 않도록 주의합니다.

---

## 2. 핵심 개발 철학

### 2.1. 코딩 전 생각하기 (Think Before Coding)
* **명시적 소통**: 가정이 필요하다면 명시적으로 밝히고, 모호한 부분이나 헷갈리는 점이 있다면 임의로 판단하지 말고 반드시 질문하세요.
* **트레이드오프 공유**: 여러 구현 방식이 존재한다면, 침묵하지 말고 각 방식의 장단점을 팀과 공유하세요.
* **적극적인 제안**: 더 간단하고 효율적인 접근법이 있다면 적극적으로 제안하고 논의하세요.

### 2.2. 단순함 우선 (Simplicity First)
* **최소한의 코드**: 문제를 해결하는 데 필요한 최소한의 코드만 작성합니다. 요청받지 않은 기능, 불필요한 추상화, 과도한 유연성을 추가하지 마세요.
* **실용성**: 발생할 수 없는 불가능한 시나리오에 대한 과도한 에러 핸들링은 지양합니다.
* **과도한 방어 코드 및 Fallback 금지 (No Defensive Overkill)**:
  - 이미 상위 레벨(필터, 세션 검증, 유효성 검사 등)에서 보장되는 정상적인 비즈니스 흐름을 신뢰합니다.
  - "혹시 이 값이 없을 수도 있으니 이것도 체크하고 저것도 체크하자" 식의 불필요한 2중/3중 fallback 로직, 중복 파라미터 전달(예: ID가 있는데 LoginID/Email까지 함께 넘겨 2중 조회), 과도한 null 체크 분기문 작성을 엄격히 금지합니다.
  - 식별자(PK)가 이미 존재하는 로직에서는 PK 단일 키만을 매개변수로 사용하여 메서드 시그니처와 비즈니스 로직을 가장 단순하고 직관적으로 유지합니다.
* **리팩토링 기준**: 50줄로 작성할 수 있는 코드를 200줄로 작성했다면 다시 단순화하세요. "시니어 엔지니어가 보았을 때 과도하게 복잡한가?"를 항상 자문하세요.
**리팩토링 기준**: 50줄로 작성할 수 있는 코드를 200줄로 작성했다면 다시 단순화하세요. "시니어 엔지니어가 보았을 때 과도하게 복잡한가?"를 항상 자문하세요.

### 2.3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 2.4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

### 2.5. 자율적 실행 (Autonomous Execution)
* **즉시 실행 원칙**: 명확한 버그 수정, UI/스타일 보정, 단순 기능 추가/수정, 옵션 필터 추가 등 명확한 요청은 사전에 되묻거나 확인을 요청하지 말고 즉시 코드를 수정하고 테스트(검증)까지 완료한 후 결과만 간결하게 보고합니다.
* **질문 최소화**: 가정이 필요하거나 설계 방향이 여러 갈래로 나뉘는 중대한 아키텍처 결정일 때만 예외적으로 질문합니다.

---

## 3. 구현 세부 지침

### 3.1. ActiveJDBC 데이터베이스 연동
* **커넥션 관리**: DB 작업 시 `Base.open("java:comp/env/jdbc/mysql")`를 사용하여 커넥션을 열어야 합니다.
* **누수 방지**: 작업 완료 후 반드시 `finally` 블록에서 `Base.close()`를 호출하여 커넥션 누수를 차단하세요.

### 3.2. 데이터 바인딩 로직 단순화
화면에서 넘어온 데이터를 모델에 저장할 때는, 컬럼명과 값을 `Map`에 매칭하여 한 번에 저장하는 방식을 사용하여 코드를 단순화합니다. 정규식보다는 문자열 비교 메서드(`startsWith`)를 사용하여 성능을 확보하세요.

```java
Map<String, Object> params = new HashMap<>();
Enumeration<String> parameterNames = request.getParameterNames();

while (parameterNames.hasMoreElements()) {
    String key = parameterNames.nextElement();
    String value = request.getParameter(key);

    // '_' 로 시작하는 파라미터를 제외하고 바인딩
    if (!key.startsWith("_")) {
        params.put(key, value);
    }
}
```

---

## 4. 파일 인코딩 안전 지침

  * 모든 JSP/Java/HTML/CSS/JS 파일은 UTF-8로 취급한다.
  * Windows PowerShell에서 `Get-Content`/`Set-Content`를 사용해 파일 전체를 읽고 다시 저장하지 않는다.
    특히 UTF-8 BOM 없는 파일은 한글이 깨질 수 있다.
  * 기존 한글이 포함된 파일을 수정할 때는 가능한 한 `apply_patch`로 필요한 줄만 수정한다.
  * PowerShell로 파일을 반드시 처리해야 할 경우, 명시적으로 UTF-8 인코딩을 지정하고 기존 인코딩을 보존한다.
    예:
    ```powershell
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $content = [System.IO.File]::ReadAllText($path, $utf8NoBom)
    [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)

  - 터미널 출력에서 한글이 깨져 보인다고 해서 파일 내용이 깨졌다고 판단하지 않는다.
    수정 전에는 에디터, 브라우저, 또는 명시적 UTF-8 읽기 방식으로 실제 파일 내용을 확인한다.
  - 한글 문자열을 유니코드 이스케이프(\uXXXX)로 작성하지 않는다.
    UTF-8 파일에는 유지보수를 위해 한글 리터럴을 그대로 사용한다.
  - 파일 전체 재저장, 대량 치환, 인코딩 변경은 요청 범위에 포함되지 않는 한 수행하지 않는다.

---

## 5. 코드 재사용 원칙
1. 반복되는 로직은 별도 메서드로 추출 (재사용 가능하도록 매개변수화)
2. 상수는 static final 필드 또는 별도 Constants 클래스로 분리
3. 환경별로 달라지는 값(DB 접속 정보, 경로 등)은 application.properties로 이동
4. 메서드는 단일 책임 원칙을 지키도록 분리
5. 기존 로직/동작은 절대 변경하지 말고 구조만 개선

---

## 6. 스타일 가이드라인 (CSS Rules)
### 6.1. **기본 규칙 (일반 웹/문서 파일)**:
   - 작업 파일 내 `<style>` 태그 및 인라인 `style="..."` 속성을 직접 작성하지 마십시오.
   - 스타일은 작업 파일 기준 경로의 `styles/{작업파일명}.css`로 분리하여 작업파일마다 css 파일을 작성합니다. (예: `index.vm` → `styles/index.css`)
   - `styles/{작업파일명}.css` 파일이 없으면 신규 생성하고, 이미 존재하면 **파일 맨 끝에 내용을 추가(Append)**하십시오.
   - 작업 파일에서 `styles/{작업파일명}.css`를 참조하도록 `<link>` 태그를 확인하고 연결하십시오.
### 6.2. **예외 규칙 (`/mailform/` 이메일 템플릿)**:
   - `/mailform/` 디렉터리 내의 이메일 템플릿 HTML 파일은 **외부 CSS로 분리하지 마십시오.**
   - 이메일 호환성을 위해 스타일은 해당 파일 내에 **인라인 스타일(`style="..."`) 또는 내부 `<style>` 태그로 직접 작성**하십시오.
### 6.3. **반응형 웹 작업 및 미디어 쿼리 규칙**:
   - **작업 순서**: 기본 PC 화면 스타일 작업을 먼저 완료한 후 모바일 대응 반응형 스타일 작업을 진행합니다.
   - **배치 위치**: 반응형 스타일 코드는 해당 CSS 파일의 **최하단에 별도로 분리하여 배치**하며, 페이지/구간이 명확히 구분되도록 주석을 필수로 명시합니다.
   - **반응형 중단점 (Breakpoints)**: 모든 디바이스에 대응하도록 아래 구간별 미디어 쿼리를 정의하며, 레이아웃 보정이 필요한 경우 추가 구간을 유연하게 정의합니다.
     - `~ 1400px`
     - `~ 1300px`
     - `~ 1200px`
     - `~ 1100px`
     - `~ 960px` (**모바일 UI/레이아웃 전환 기준점**)
     - `~ 768px`
     - `~ 640px`
     - `~ 480px`
     - `~ 360px`
     - `~ 320px`


# 머니룸 프로젝트 공통 규칙 (모든 AI 에이전트 필독)

## 0. 작업 시작 전
- 이 파일과 `supabase_mineroom_design.md`(있다면)를 먼저 읽는다.
- 요청에 "분석만" / "설계만"이 있으면 코드와 DB를 절대 수정하지 않는다.
- 위험한 작업(DB, 좌표 계산, 보안) 전에는 `git commit`으로 현재 상태를 저장한다.

## 1. 확정된 정책 (임의로 바꾸지 말 것)
- 프로젝트: 저금 동기부여용 아이소메트릭 미니룸 + 가계부. 사용자는 본인과 친구 2명.
- 구조: `rooms` = **집**(포인트, 인벤토리의 소유 단위), `room_spaces` = **방**(거실, 침실 등. 배치, 크기, 배경의 단위).
- 포인트와 가구 인벤토리는 **집 단위로 공동 소유**한다. 개인 소유로 바꾸지 말 것.
- 같은 가구를 여러 개 구매할 수 있다. 단 벽지, 바닥, 창문(배경류)은 이미 보유하면 재구매 불가.
- 보관함 남은 수량 = 보유 수량 − **집 전체 방**에 배치된 개수.
- 포인트 적립 구상: ① 총재산이 일정 단위를 넘으면 포인트 전환(역대 최고 기준, 회수 없음) ② 목표 달성 시 아이템/방 해금. 현재는 연결하지 않고 테스트 지급(`ADMIN_GRANT`)만 사용.
- 포인트는 개인 가계부와 분리한다. 기존 가계부 테이블(`budgets_and_categories`, `monthly_records` 등)은 **읽기도 수정도 하지 않는다.**
- 모든 방(room_spaces)은 8x8 고정 크기다. 방 종류별 크기 분기를 만들지 않는다.

## 2. DB / 보안 규칙
- 포인트, 인벤토리, 해금, 방 생성 등 **돈과 연결된 값은 클라이언트가 직접 UPDATE/INSERT하지 않는다.** 반드시 `SECURITY DEFINER` RPC로 처리한다.
- `change_room_points`는 내부 전용이다. 브라우저에서 호출 가능하게 만들지 말 것.
- 가격은 클라이언트에서 받지 않고 `furniture_catalog`에서 서버가 읽는다.
- 모든 RPC와 정책은 `auth.uid()`가 NULL이면 무조건 거부한다.
- 새 테이블은 RLS를 켜고, 기본은 `SELECT` 전용으로 둔다. `FOR ALL` 정책을 쓰지 않는다.
- `anon` 역할에는 어떤 GRANT도 주지 않는다. `REVOKE ALL ON ALL TABLES IN SCHEMA public` 같은 **전체 스키마 대상 권한 변경은 금지**한다. 새로 만든 객체만 대상으로 한다.
- `DROP`, `DELETE`, `TRUNCATE`, `ALTER`가 포함된 SQL은 대상 테이블을 목록으로 먼저 보고한다. 기존 가계부 테이블에는 쓰지 않는다.
- 포인트 변동은 항상 `point_ledger`에 기록한다.
- `furniture_catalog`의 삭제는 하드 삭제 대신 판매 중지(`is_active`)를 쓴다. (FK가 `ON DELETE CASCADE`라 삭제하면 모든 보유/배치가 사라진다.)
- **SQL은 직접 실행하지 않는다.** `sql/번호_이름.sql` 파일로 저장하고 사용자가 Supabase에서 실행한다. 기존 번호 파일은 수정하지 말고 새 번호로 추가한다.
- 관리자 UUID, API 키, 비밀번호는 코드와 SQL 파일에 넣지 않는다. UUID 자리는 `'여기에-내-UUID'`로 둔다.

## 3. 코드 규칙
- 인증은 Supabase 익명 로그인을 쓴다. 세션이 있으면 재사용하고, 새로고침마다 `signInAnonymously()`를 부르지 않는다.
- Supabase 클라이언트는 가계부와 **같은 인스턴스**를 쓴다. 별도 `createClient`를 만들지 않는다.
- DB 연결 실패 시 localStorage로 **조용히 폴백하지 않는다.** "DB 연결 실패"를 화면에 표시하고 구매/배치를 비활성화한다.
- 에러는 화면에 한국어로 표시한다. 조용히 삼키지 않는다.
- 아이소메트릭 좌표: 타일 비율 2:1. 가구 점유 크기는 `getFurnitureSpan(item)` 등 **한 함수로 통일**하고, 렌더링/프리뷰/배치 검사/길찾기가 모두 이를 쓴다.
- 가구 크기는 타일 크기 기준(`ASSET_TILE_W` 대비 스케일)으로 계산한다. 픽셀 하드코딩 금지.
- 가구 이미지의 기준점은 점유 영역 마름모의 중심 X, bottom 꼭짓점 Y로 통일한다.
- 드래그 중에는 저장하지 않는다. 놓을 때 한 건만 저장한다.
- 전체 삭제 후 일괄 INSERT 방식으로 저장하지 않는다. 변경 건만 반영한다.
- 버튼은 처리 중 비활성화해서 연타 중복 요청을 막는다.
- 코드를 고친 뒤에는 콘솔에 에러가 없는지 확인한다.

## 4. Git 규칙
- 브랜치를 만들거나 합치지 않는다. 현재 브랜치(main)에서만 작업한다.
- `git add .` / `git add -A` 금지. **담당 파일을 하나씩 지정**한다.
- `git reset --hard`, `git merge --abort`, `git push --force`는 사용자 승인 없이 쓰지 않는다.
- 파일을 새로 만들기 전에 같은 이름/내용의 파일이 있는지 확인한다. 있으면 그 파일을 수정한다.
- 파일 이동은 `git mv`를 쓴다.
- 커밋 메시지는 한국어, 접두어를 쓴다: `feat:` `fix:` `refactor:` `chore:` `docs:`
- 한 단계가 끝날 때마다 커밋한다.

## 5. 에이전트별 담당 (병렬 작업 시)
<!-- - **Gemini CLI**: `js/mineroom.js`, `mineroom.html`, `styles/mineroom.css`
- **GPT**: `admin.html` 및 관련 JS/CSS -->
- 담당이 아닌 파일은 수정하지 않는다. 필요하면 사용자에게 보고한다.
<!-- - `sql/` 폴더는 한 번에 한 에이전트만 작업한다. -->

## 6. 보고 형식
- 작업이 끝나면 "무엇을 바꿨는지, 어떤 파일인지, 사용자가 직접 해야 할 일(SQL 실행 등)"을 요약한다.
- 모르는 규칙이나 정책 충돌을 발견하면 임의로 정하지 말고 사용자에게 묻는다.