/**
 * ============================================================================
 * 🌸 영일대향수공방 사장님 비서 - Google Apps Script (Code.gs)
 * ============================================================================
 * [사용 방법]
 * 1. 구글 시트 「영일대향수공방 매출 장부」를 엽니다.
 * 2. 상단 메뉴 [확장 프로그램] -> [Apps Script]를 클릭합니다.
 * 3. 기존 코드를 모두 지우고 이 파일(Code.gs)의 내용을 통째로 붙여넣고 저장(Ctrl+S)합니다.
 * 4. 우측 상단 [배포] -> [새 배포] -> 유형: [웹 앱] 선택
 *    - 다음 사용자로 실행: [나 (본인 계정)]
 *    - 액세스 권한이 있는 사용자: [모든 사용자]
 * 5. 배포 후 나오는 '웹 앱 URL'을 복사해 index.html 화면의 설정 창에 붙여넣으면 끝!
 * ============================================================================
 */

// 1. 기본 설정값
const SHEET_NAME = '매출내역';        // 데이터가 저장될 하단 시트 탭 이름 (자동 생성됨)
const ACCESS_PIN = '0306';            // 사장님 전용 비밀번호
const TIMEZONE = 'Asia/Seoul';        // 한국 시간 기준

// 2. 구글 제미나이(Gemini) API 키 (선택: 여기에 직접 넣으시거나, 웹 화면 [⚙️설정]에서 넣으셔도 됩니다)
const DEFAULT_GEMINI_API_KEY = '';

// 공방 기본 선택지
const CATEGORIES = ['원데이 클래스', '커플 클래스', '단체/출강', '완제품 판매', '답례품', '키즈 클래스', '기타'];
const PAYMENTS = ['카드', '계좌이체', '현금', '네이버페이', '포항사랑상품권', '기타'];
const CHANNELS = ['인스타', '네이버(검색/예약)', '당근', '지인 추천', '워크인(지나가다 방문)', '재방문', '기타'];

/**
 * 브라우저에서 웹 앱 URL로 직접 접속했을 때 안내 메시지 또는 데이터 조회 처리
 */
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};

  if (params.action === 'summary') {
    if (String(params.pin || '') !== ACCESS_PIN) {
      return jsonResponse({ ok: false, error: '비밀번호(0306)가 일치하지 않습니다.' });
    }
    return jsonResponse(getDashboardData());
  }

  // 주소창으로 바로 열어본 경우 안내 화면 표시
  const html = `
    <!DOCTYPE html>
    <html lang="ko">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>영일대향수공방 사장님 비서 서버</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Pretendard", sans-serif; background:#fdfaf6; color:#3d312a; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; padding:20px; box-sizing:border-box; }
      .card { background:#fff; border:1px solid #eadfce; border-radius:20px; padding:28px; max-width:440px; text-align:center; box-shadow:0 10px 25px rgba(61,49,42,0.06); }
      h1 { font-size:20px; margin:0 0 12px; color:#8c5a3c; }
      p { font-size:14px; line-height:1.6; color:#6b5b52; margin:0; }
      .badge { display:inline-block; background:#e8f5e9; color:#2e7d32; font-weight:700; font-size:13px; padding:6px 12px; border-radius:999px; margin-bottom:14px; }
    </style></head>
    <body>
      <div class="card">
        <div class="badge">✅ 연결 준비 완료</div>
        <h1>🌸 영일대향수공방 사장님 비서</h1>
        <p>구글 시트 웹 앱 서버가 정상 작동 중입니다.<br>지금 주소창의 URL을 복사해서 <b>사장님 비서 앱(index.html)</b>의 설정 창에 붙여넣어 주세요!</p>
      </div>
    </body>
    </html>
  `;
  return HtmlService.createHtmlOutput(html).setTitle('영일대향수공방 사장님 비서');
}

/**
 * 앱(index.html)에서 보내는 요청 처리 (AI 분석 / 시트 저장 / 최근내역·합계 조회 / 키 저장 / 삭제)
 */
function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const body = JSON.parse(raw);
    const action = body.action || '';
    const pin = String(body.pin || '').trim();

    if (pin !== ACCESS_PIN) {
      return jsonResponse({ ok: false, error: '비밀번호가 올바르지 않습니다.' });
    }

    // 1) 음성/문장 AI 자동 분석
    if (action === 'analyze') {
      const text = String(body.text || '').trim();
      if (!text) {
        return jsonResponse({ ok: false, error: '분석할 문장을 입력해 주세요.' });
      }
      const clientApiKey = String(body.geminiApiKey || '').trim();
      if (clientApiKey) {
        PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', clientApiKey);
      }
      const analysis = analyzeWithAI(text);
      return jsonResponse({
        ok: true,
        data: analysis.data,
        aiMode: analysis.aiMode,
        notice: analysis.notice || ''
      });
    }

    // 2) 확인한 매출 데이터를 구글 시트에 한 줄로 저장
    if (action === 'save') {
      const record = body.record || {};
      const saved = appendSaleRecord(record);
      const dashboard = getDashboardData();
      return jsonResponse({
        ok: true,
        saved: saved,
        dashboard: dashboard.dashboard
      });
    }

    // 3) 최근 5건 및 오늘/이번 달 매출 합계 조회
    if (action === 'summary') {
      return jsonResponse(getDashboardData());
    }

    // 4) Gemini API 키 저장 및 연결 확인
    if (action === 'saveApiKey') {
      const newKey = String(body.geminiApiKey || '').trim();
      if (newKey) {
        PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', newKey);
      }
      return jsonResponse({
        ok: true,
        hasApiKey: Boolean(getGeminiApiKey()),
        message: 'Gemini API 키가 안전하게 저장되었습니다.'
      });
    }

    // 5) 방금 잘못 입력한 행 삭제 (행 번호 기준)
    if (action === 'deleteRow') {
      const rowNumber = Number(body.rowNumber || 0);
      deleteSaleRow(rowNumber);
      const dashboard = getDashboardData();
      return jsonResponse({
        ok: true,
        dashboard: dashboard.dashboard
      });
    }

    return jsonResponse({ ok: false, error: '알 수 없는 요청입니다: ' + action });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: '서버 처리 중 오류가 발생했습니다: ' + (err && err.message ? err.message : String(err))
    });
  }
}

/**
 * JSON 응답 생성 헬퍼
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 저장된 Gemini API 키 가져오기
 */
function getGeminiApiKey() {
  if (DEFAULT_GEMINI_API_KEY && DEFAULT_GEMINI_API_KEY.trim() !== '') {
    return DEFAULT_GEMINI_API_KEY.trim();
  }
  const scriptProps = PropertiesService.getScriptProperties();
  const directKey = scriptProps.getProperty('GEMINI_API_KEY') ||
                    scriptProps.getProperty('API_KEY') ||
                    scriptProps.getProperty('GEMINI_KEY') ||
                    scriptProps.getProperty('GOOGLE_API_KEY');
  if (directKey && directKey.trim() !== '') {
    return directKey.trim();
  }
  // 속성 이름을 다르게 저장하셨더라도 값(AIza... 등)을 자동으로 찾아서 인식
  const allProps = scriptProps.getProperties();
  for (const k in allProps) {
    const val = String(allProps[k] || '').trim();
    if (val.indexOf('AIza') === 0 || /gemini|api|key/i.test(k)) {
      if (val) return val;
    }
  }
  return '';
}

/**
 * 「매출내역」 시트 탭 가져오기 (없으면 자동 생성 및 예쁜 표 머리글 서식 적용)
 */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // 첫 번째 줄(헤더)이 비어 있으면 자동 생성
  if (sheet.getLastRow() === 0) {
    const headers = ['날짜', '구분', '인원', '금액', '결제수단', '유입경로', '비고', '입력일시'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    // 헤더 디자인 꾸미기
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#8C5A3C');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    sheet.setFrozenRows(1);

    // 열 너비 보기 좋게 조정
    sheet.setColumnWidth(1, 110); // 날짜
    sheet.setColumnWidth(2, 130); // 구분
    sheet.setColumnWidth(3, 70);  // 인원
    sheet.setColumnWidth(4, 110); // 금액
    sheet.setColumnWidth(5, 120); // 결제수단
    sheet.setColumnWidth(6, 150); // 유입경로
    sheet.setColumnWidth(7, 220); // 비고
    sheet.setColumnWidth(8, 150); // 입력일시
  }

  return sheet;
}

/**
 * 구글 시트에 매출 한 줄 추가
 */
function appendSaleRecord(record) {
  const sheet = getOrCreateSheet();
  const now = new Date();
  const todayStr = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd');
  const timestampStr = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

  const dateStr = normalizeDateString(record.date || todayStr);
  const category = String(record.category || '원데이 클래스').trim();
  const people = Math.max(0, parseInt(record.people, 10) || 1);
  const amount = Math.max(0, parseInt(String(record.amount || '0').replace(/[^0-9]/g, ''), 10) || 0);
  const payment = String(record.payment || '카드').trim();
  const channel = String(record.channel || '인스타').trim();
  const memo = String(record.memo || '').trim();

  const rowValues = [dateStr, category, people, amount, payment, channel, memo, timestampStr];
  sheet.appendRow(rowValues);

  const lastRow = sheet.getLastRow();
  // 서식 지정 (날짜 텍스트 고정, 인원/금액 숫자 서식)
  sheet.getRange(lastRow, 1).setNumberFormat('yyyy-mm-dd').setHorizontalAlignment('center');
  sheet.getRange(lastRow, 2).setHorizontalAlignment('center');
  sheet.getRange(lastRow, 3).setNumberFormat('#,##0"명"').setHorizontalAlignment('right');
  sheet.getRange(lastRow, 4).setNumberFormat('#,##0"원"').setHorizontalAlignment('right');
  sheet.getRange(lastRow, 5).setHorizontalAlignment('center');
  sheet.getRange(lastRow, 6).setHorizontalAlignment('center');
  sheet.getRange(lastRow, 8).setFontColor('#888888').setHorizontalAlignment('center');

  return {
    rowNumber: lastRow,
    date: dateStr,
    category: category,
    people: people,
    amount: amount,
    payment: payment,
    channel: channel,
    memo: memo,
    createdAt: timestampStr
  };
}

/**
 * 특정 행 삭제 (방금 잘못 저장한 내역 취소용)
 */
function deleteSaleRow(rowNumber) {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  if (rowNumber <= 1 || rowNumber > lastRow) {
    throw new Error('삭제할 수 없는 행 번호입니다.');
  }
  sheet.deleteRow(rowNumber);
}

/**
 * 오늘/이번 달 매출 합계 + 최근 5건 내역 조회
 */
function getDashboardData() {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  const now = new Date();
  const todayStr = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd');
  const currentMonthPrefix = todayStr.substring(0, 7); // 'YYYY-MM'

  let todayTotal = 0;
  let todayCount = 0;
  let todayPeople = 0;

  let monthTotal = 0;
  let monthCount = 0;
  let monthPeople = 0;

  const recentItems = [];

  if (lastRow >= 2) {
    const numRows = lastRow - 1;
    const values = sheet.getRange(2, 1, numRows, 8).getValues();

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const dateStr = normalizeDateString(row[0]);
      const category = String(row[1] || '');
      const people = Number(row[2]) || 0;
      const amount = Number(String(row[3] || '0').replace(/[^0-9.-]/g, '')) || 0;
      const payment = String(row[4] || '');
      const channel = String(row[5] || '');
      const memo = String(row[6] || '');
      const createdAt = row[7] ? String(row[7]) : '';

      if (dateStr === todayStr) {
        todayTotal += amount;
        todayCount += 1;
        todayPeople += people;
      }
      if (dateStr.indexOf(currentMonthPrefix) === 0) {
        monthTotal += amount;
        monthCount += 1;
        monthPeople += people;
      }

      recentItems.push({
        rowNumber: i + 2,
        date: dateStr,
        category: category,
        people: people,
        amount: amount,
        payment: payment,
        channel: channel,
        memo: memo,
        createdAt: createdAt
      });
    }
  }

  // 최신순으로 뒤집어서 최근 5건만 추출
  const recent5 = recentItems.reverse().slice(0, 5);

  return {
    ok: true,
    hasApiKey: Boolean(getGeminiApiKey()),
    dashboard: {
      todayDate: todayStr,
      currentMonth: currentMonthPrefix,
      todayTotal: todayTotal,
      todayCount: todayCount,
      todayPeople: todayPeople,
      monthTotal: monthTotal,
      monthCount: monthCount,
      monthPeople: monthPeople,
      recent: recent5
    }
  };
}

/**
 * 날짜 값을 'YYYY-MM-DD' 문자열로 통일
 */
function normalizeDateString(val) {
  if (!val) {
    return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  }
  if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, TIMEZONE, 'yyyy-MM-dd');
  }
  const str = String(val).trim();
  const match = str.match(/(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/);
  if (match) {
    const y = match[1];
    const m = ('0' + match[2]).slice(-2);
    const d = ('0' + match[3]).slice(-2);
    return `${y}-${m}-${d}`;
  }
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
}

/**
 * ============================================================================
 * 🤖 Gemini AI 분석 (API 키가 없거나 일시 오류 시 스마트 한국어 규칙 분석으로 자동 백업)
 * ============================================================================
 */
function analyzeWithAI(text) {
  const apiKey = getGeminiApiKey();
  const now = new Date();
  const todayStr = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd');
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = Utilities.formatDate(yesterday, TIMEZONE, 'yyyy-MM-dd');
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const twoDaysAgoStr = Utilities.formatDate(twoDaysAgo, TIMEZONE, 'yyyy-MM-dd');

  if (apiKey) {
    try {
      const geminiResult = callGeminiAPI(apiKey, text, todayStr, yesterdayStr, twoDaysAgoStr);
      if (geminiResult) {
        return {
          aiMode: 'gemini',
          data: geminiResult
        };
      }
    } catch (err) {
      // Gemini 호출 실패 시 아래 내장 분석기로 안전하게 처리 후 안내 메시지 전달
      const fallbackData = parseKoreanSalesText(text, todayStr, yesterdayStr, twoDaysAgoStr);
      return {
        aiMode: 'fallback',
        notice: 'Gemini API 호출 중 일시적 오류가 있어 내장 자동 분석으로 정리했습니다: ' + err.message,
        data: fallbackData
      };
    }
  }

  // API 키 미입력 상태일 때도 즉시 작동하도록 내장 한국어 파서 실행
  const fallbackData = parseKoreanSalesText(text, todayStr, yesterdayStr, twoDaysAgoStr);
  return {
    aiMode: 'fallback',
    notice: '현재 Gemini API 키가 등록되지 않아 기본 자동 분류로 정리했습니다. (⚙️설정에서 Gemini 키를 넣으시면 진짜 AI 분석이 켜집니다!)',
    data: fallbackData
  };
}

/**
 * Google Gemini REST API 호출
 */
function callGeminiAPI(apiKey, text, todayStr, yesterdayStr, twoDaysAgoStr) {
  const prompt = `
당신은 포항 향수 공방 '영일대향수공방' 사장님의 매출 기록 비서입니다.
사장님이 수업이나 판매 후 말한 문장을 분석해서 아래 JSON 형식으로만 정확히 반환하세요.

[기준 날짜 정보]
- 오늘 날짜: ${todayStr}
- 어제 날짜: ${yesterdayStr}
- 그저께 날짜: ${twoDaysAgoStr}

[분류 기준 및 허용 항목]
1. date: "YYYY-MM-DD" 형식. 별도 언급이 없거나 "오늘"이면 "${todayStr}", "어제"면 "${yesterdayStr}", "그저께/엊그제"면 "${twoDaysAgoStr}". 특정 월/일(예: 10월 25일)을 말하면 올해 연도 기준 YYYY-MM-DD로 변환.
2. category (구분): 다음 중 가장 알맞은 값 선택 -> ${JSON.stringify(CATEGORIES)}
   - "원데이", "체험", "클래스" -> "원데이 클래스"
   - "커플", "데이트" -> "커플 클래스"
   - "단체", "출강", "기업", "학교" -> "단체/출강"
   - "완제품", "구매", "향수 판매", "디퓨저 판매" -> "완제품 판매"
   - "답례품", "선물세트" -> "답례품"
   - "키즈", "어린이", "아이" -> "키즈 클래스"
   - 그 외 애매하면 "원데이 클래스" 또는 "기타"
3. people (인원): 정수(숫자). 예: "2명", "두명", "커플" -> 2. 언급이 없으면 1.
4. amount (금액): 원 단위 정수(숫자). 예: "7만원" -> 70000, "7만5천원" -> 75000, "10만5천" -> 105000.
5. payment (결제수단): 다음 중 가장 알맞은 값 선택 -> ${JSON.stringify(PAYMENTS)}
   - "카드", "신용카드", "체크카드" -> "카드"
   - "이체", "계좌", "무통장", "입금" -> "계좌이체"
   - "현금" -> "현금"
   - "네이버페이", "N페이" -> "네이버페이"
   - "포항사랑", "상품권", "지역화폐" -> "포항사랑상품권"
   - 언급 없으면 "카드"
6. channel (유입경로): 다음 중 가장 알맞은 값 선택 -> ${JSON.stringify(CHANNELS)}
   - "인스타", "인스타그램", "릴스", "DM" -> "인스타"
   - "네이버", "블로그", "스마트플레이스", "예약", "검색" -> "네이버(검색/예약)"
   - "당근", "당근마켓" -> "당근"
   - "지인", "소개", "추천", "친구" -> "지인 추천"
   - "지나가다", "워크인", "길가다", "간판 보고" -> "워크인(지나가다 방문)"
   - "단골", "재방문", "또 오심" -> "재방문"
   - 언급 없으면 "기타"
7. memo (비고): 날짜, 구분, 인원, 금액, 결제수단, 유입경로를 제외한 추가 특이사항(예: "50ml 변경", "단골 손님", "영수증 리뷰 작성", "우디향 선호" 등)이 있으면 자연스럽게 적고, 없으면 빈 문자열("")로 반환.

[사장님이 말한 문장]
"""
${text}
"""

반드시 아래 키를 가진 순수 JSON 객체만 출력하세요:
{"date":"YYYY-MM-DD","category":"...","people":2,"amount":70000,"payment":"...","channel":"...","memo":"..."}
`.trim();

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastError = null;

  for (let i = 0; i < models.length; i++) {
    const modelName = models[i];
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent?key=' + encodeURIComponent(apiKey);
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    };

    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    const bodyText = res.getContentText();

    if (code >= 200 && code < 300) {
      const json = JSON.parse(bodyText);
      const rawText = json.candidates &&
                      json.candidates[0] &&
                      json.candidates[0].content &&
                      json.candidates[0].content.parts &&
                      json.candidates[0].content.parts[0] &&
                      json.candidates[0].content.parts[0].text;
      if (rawText) {
        const cleaned = rawText.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
          date: normalizeDateString(parsed.date || todayStr),
          category: parsed.category || '원데이 클래스',
          people: Math.max(1, parseInt(parsed.people, 10) || 1),
          amount: Math.max(0, parseInt(String(parsed.amount || '0').replace(/[^0-9]/g, ''), 10) || 0),
          payment: parsed.payment || '카드',
          channel: parsed.channel || '인스타',
          memo: String(parsed.memo || '').trim()
        };
      }
    } else {
      lastError = new Error('HTTP ' + code + ': ' + bodyText.substring(0, 160));
    }
  }

  if (lastError) {
    throw lastError;
  }
  return null;
}

/**
 * 내장 한국어 매출 문장 분석기 (Gemini 키 등록 전이거나 오프라인/오류 시 즉시 작동)
 */
function parseKoreanSalesText(text, todayStr, yesterdayStr, twoDaysAgoStr) {
  const s = String(text || '').trim();

  // 1. 날짜 추출
  let date = todayStr;
  if (/그저께|엊그제/.test(s)) {
    date = twoDaysAgoStr;
  } else if (/어제/.test(s)) {
    date = yesterdayStr;
  } else {
    const mdMatch = s.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    if (mdMatch) {
      const year = todayStr.substring(0, 4);
      const m = ('0' + mdMatch[1]).slice(-2);
      const d = ('0' + mdMatch[2]).slice(-2);
      date = `${year}-${m}-${d}`;
    }
  }

  // 2. 구분 추출
  let category = '원데이 클래스';
  if (/커플|데이트/.test(s)) category = '커플 클래스';
  else if (/단체|출강|기업|학교|동아리/.test(s)) category = '단체/출강';
  else if (/완제품|구매|판매|디퓨저|룸스프레이/.test(s)) category = '완제품 판매';
  else if (/답례품|선물/.test(s)) category = '답례품';
  else if (/키즈|어린이|아이|초등/.test(s)) category = '키즈 클래스';
  else if (/원데이|클래스|수업|체험/.test(s)) category = '원데이 클래스';

  // 3. 인원 추출
  let people = 1;
  const peopleNumMatch = s.match(/(\d+)\s*(명|분|인)/);
  if (peopleNumMatch) {
    people = parseInt(peopleNumMatch[1], 10);
  } else {
    const korPeopleMap = {
      '한명': 1, '한 명': 1, '혼자': 1,
      '두명': 2, '두 명': 2, '둘이': 2, '커플': 2,
      '세명': 3, '세 명': 3, '셋이': 3,
      '네명': 4, '네 명': 4, '넷이': 4,
      '다섯명': 5, '다섯 명': 5,
      '여섯명': 6, '여섯 명': 6
    };
    for (const k in korPeopleMap) {
      if (s.indexOf(k) !== -1) {
        people = korPeopleMap[k];
        break;
      }
    }
  }

  // 4. 금액 추출 (예: "7만원", "7만 5천원", "12만5천", "70,000원", "70000")
  let amount = 0;
  const manCheonMatch = s.match(/(\d+)\s*만\s*(\d+)\s*천\s*원?/);
  const manRestMatch = s.match(/(\d+)\s*만\s*(\d{3,4})\s*원?/);
  const manOnlyMatch = s.match(/(\d+(?:\.\d+)?)\s*만\s*원?/);
  const cheonOnlyMatch = s.match(/(\d+)\s*천\s*원?/);
  const rawWonMatch = s.match(/(\d{1,3}(?:,\d{3})+|\d{4,8})\s*원?/);

  if (manCheonMatch) {
    amount = parseInt(manCheonMatch[1], 10) * 10000 + parseInt(manCheonMatch[2], 10) * 1000;
  } else if (manRestMatch) {
    amount = parseInt(manRestMatch[1], 10) * 10000 + parseInt(manRestMatch[2], 10);
  } else if (manOnlyMatch) {
    amount = Math.round(parseFloat(manOnlyMatch[1]) * 10000);
  } else if (cheonOnlyMatch) {
    amount = parseInt(cheonOnlyMatch[1], 10) * 1000;
  } else if (rawWonMatch) {
    amount = parseInt(rawWonMatch[1].replace(/,/g, ''), 10);
  }

  // 5. 결제수단 추출
  let payment = '카드';
  if (/포항사랑|상품권|지역화폐/.test(s)) payment = '포항사랑상품권';
  else if (/네이버\s*페이|엔페이|N페이/i.test(s)) payment = '네이버페이';
  else if (/계좌|이체|무통장|입금|송금/.test(s)) payment = '계좌이체';
  else if (/현금|만원짜리/.test(s)) payment = '현금';
  else if (/카드|신용|체크/.test(s)) payment = '카드';

  // 6. 유입경로 추출
  let channel = '인스타';
  if (/인스타|릴스|피드|DM|디엠/i.test(s)) channel = '인스타';
  else if (/네이버|블로그|예약|검색|플레이스/.test(s)) channel = '네이버(검색/예약)';
  else if (/당근/.test(s)) channel = '당근';
  else if (/지인|소개|추천|친구|엄마/.test(s)) channel = '지인 추천';
  else if (/워크인|지나가다|길가다|간판|그냥\s*오/.test(s)) channel = '워크인(지나가다 방문)';
  else if (/재방문|단골|또\s*오|다시\s*오/.test(s)) channel = '재방문';

  // 7. 비고(메모) 추출: ml 용량, 향 이름, 단골/선물 등 특이사항이나 쉼표 뒤 남은 메모
  let memoParts = [];
  const mlMatch = s.match(/\d+\s*ml(\s*변경|\s*추가|\s*업그레이드)?/i);
  if (mlMatch) memoParts.push(mlMatch[0].trim());

  // 괄호 안 메모나 '비고:' 뒤의 텍스트 추출
  const memoTagMatch = s.match(/(?:비고|메모|특이사항)\s*[:：]?\s*(.+)$/);
  if (memoTagMatch) {
    memoParts.push(memoTagMatch[1].trim());
  }

  return {
    date: date,
    category: category,
    people: people,
    amount: amount,
    payment: payment,
    channel: channel,
    memo: memoParts.join(', ')
  };
}
