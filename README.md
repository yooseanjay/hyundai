# 🚗 우리 차가 살아있다면

> 내 차가 말하는 캐릭터가 되어, 실제 차량 데이터에 반응하고 함께 달린 하루를 일기로 남기는 서비스
> 현대자동차 Open API 공모전 출품작

**체험하기 → https://yooseanjay.github.io/hyundai/** (데모 모드: 차량 데이터는 시뮬레이터, 대화 AI는 실제 동작)

## 핵심 경험

```
차 상태 확인 ──▶ 출발(주행 카드 · 실시간 차량 상태) ──▶ 하차 시 '오늘의 일기'
      ▲                                                        │
      └────────── 언제든 말 걸기: "충전소 찾아줘", "노래 틀어줘" ◀──┘
```

| 차량 데이터 (Hyundai Open API) | 캐릭터 반응 |
|---|---|
| 배터리 SoC · 주행 가능 거리 | 배가 고프면 시무룩한 표정, 충전하면 "냠냠" |
| 경고 정보 (타이어 공기압, 엔진오일, 브레이크오일, 워셔액, 램프, 스마트키) | 아픈 표정과 대사, 화면에 바로 알림 |
| 운행 기록 (거리, 시간, 평균 속도, 급제동) | 일기 내용, 주간 운전 리포트 |
| 누적 주행거리 | 소모품 교체 시기 안내 |
| 주차 위치 | 일기 속 장소, 마지막 주차 위치 |

## 화면 (탭 3개)

- **홈**: 360° 돌려 보는 3D 내 차 + 앞면 스크린 얼굴, 차량 상태(배터리·주행 가능 거리·타이어 공기압·경고등·주차 위치), 바로 출발. 주행 중엔 도로 장면과 주행 카드
- **꾸미기**: 얼굴 표정·얼굴 빛·이름, 차 색상(차종마다 현대차 공식 가격표의 실제 외장 색만)
- **일기**: 하차할 때마다 쌓이는 캐릭터의 일기장

3D 차량: 아이오닉 5 · 아반떼 · 쏘나타 디 엣지 · 그랜저 (데모에서는 꾸미기 › 색상에서 차종 변경)

## 말 걸기 (음성 대화)

마이크 버튼을 누르고 말하면 차 상태를 아는 캐릭터가 짧게 대답하고, 필요하면 화면에 카드를 띄웁니다.

| 이렇게 말하면 | 이렇게 해 줘요 |
|---|---|
| "근처 충전소 / 주유소 / 세차장 / 정비소 / 카페" | 카카오맵 · 네이버 지도 바로가기 |
| "오늘 날씨 어때?" | 지금 위치 날씨와 운전 팁 |
| "어디 놀러 갈까?" | 남은 주행 거리 안에서 갈 만한 곳 추천 |
| "소모품 언제 갈아?" | 누적 거리로 계산한 교체 시기 |
| "이번 주 운전 어땠어?" | 주간 운전 리포트 |
| "신나는 노래 틀어줘" | Spotify 재생 카드 (서버에 Spotify 키가 없으면 Spotify 검색으로 연결) |

- 대화: Google Gemini (서버가 대신 호출, 키는 브라우저에 오지 않음). 키가 없거나 무료 사용량을 넘으면 기본 대답으로 자동 전환
- 목소리: Gemini TTS (여자·남자 목소리 선택), 브라우저 안에서 도는 오픈소스 Supertonic 2

## 🚘 Pleos Connect 차 안 앱 (`pleos/`)

현대자동차그룹 차량용 OS **Pleos Connect**(Android Automotive)에서 도는 앱. 지금 웹 앱을 그대로 앱 안에 넣고, 차 데이터는 **Pleos Vehicle SDK**로 직접 읽습니다 — 로그인 없이 시동만 걸면 내 차가 캐릭터가 됩니다.

| Vehicle SDK 값 | 앱에서 |
|---|---|
| `EvBattery` 배터리 % · 충전 중 / `Fuel` 연료 % | 배고픔 · 충전하면 "냠냠" |
| `Odometer` 누적 주행거리 · 주행 가능 거리 | 소모품 교체 시기 · 남은 거리 안의 추천 장소 |
| `Safety` 엔진오일 · 브레이크액 · 워셔액 부족 | 아픈 표정 · 경고 카드 |

- **차 화면 배치**: 넓은 가로 화면에서는 왼쪽에 3D 차, 오른쪽에 상태 · 카드 · 대화 (휴대폰은 그대로). 웹에서 미리 보기: 주소 끝에 `?car`
- **읽기 전용**: 웹에는 `window.PleosVehicle.snapshot()` 하나만 열어 둠. 문·창문·공조 같은 차 제어 기능은 넣지 않음
- **오프라인 화면**: 웹 앱 파일을 앱 안에 넣고 `https://yooseanjay.github.io/hyundai/` 주소로 띄움 (대화 AI 서버가 이미 허용한 주소)
- **주행 중 안전**: `distractionOptimized`를 선언하지 않아 주행 중에는 시스템이 화면을 가림
- 링크(카카오맵 · 네이버 지도 · Spotify)는 앱 밖에서 열고, 마이크는 말 걸기 버튼을 누를 때만 요청
- 운행 기록은 차 GPS로 재고 기기 안에 암호화 저장 (Vehicle SDK에 운행 기록 목록이 없음)

```bash
npm run build:pleos   # 웹 앱을 pleos/app/src/main/assets/web 에 빌드 (키 미포함 검사)
```

그다음 `pleos/` 폴더를 Android Studio로 열고 **Pleos Connect Emulator**(Android 14, API 34)에서 실행합니다. 에뮬레이터 설치와 SDK 사용 신청은 [Pleos 개발자 문서](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator) 참고. Vehicle SDK `ai.pleos.playground:Vehicle:2.3.2`는 공개 Maven 저장소에서 받습니다.

## 실행

```bash
npm install
npm run dev     # http://localhost:5173  (?demo 를 붙이면 데모 모드)
```

## 실제 API 연결

1. `.env.example`을 `.env.local`로 복사
2. `VITE_DATA_SOURCE=hyundai`, `VITE_HYUNDAI_CLIENT_ID`, `HYUNDAI_CLIENT_SECRET` 입력
3. OAuth 로그인과 토큰 교환은 서버(`server/hyundaiAuth.ts`, 배포 시 `api/auth.ts` · `api/car.ts`)가 처리 — client secret은 브라우저에 오지 않음
4. 호출하는 API: 차량 목록, 누적 주행거리, 주행 가능 거리, EV 배터리·충전 상태, 경고 정보, 주차 위치, 운행 기록 (`src/api/hyundaiClient.ts`)

> ⚠️ client secret과 토큰은 절대 커밋하지 마세요. `.env.local`은 `.gitignore`에 포함되어 있습니다.

## 🔐 보안 — 3단계 방어

내 차 상태는 **나만** 보고, 대화 기록·일기장·개인정보는 **기기 밖으로 평문으로 나가지 않게** 세 겹으로 지킵니다. 자세한 설계·위협 모델·표준 대응표는 **[SECURITY.md](SECURITY.md)**.

| 단계 | 핵심 |
|---|---|
| 1 · 관문 | 엄격한 CSP, HSTS, 출처 검사, 함수별 속도·크기 제한, 비밀값 검사 CI, CodeQL |
| 2 · 주인 확인 | OAuth + PKCE, AES-256-GCM 봉인 세션 쿠키(HttpOnly), 로그인 때 묶은 **내 차 ID 외 403** |
| 3 · 내 기기 금고 | 저장 데이터 AES-256-GCM 암호화, PIN(PBKDF2 310,000회) 잠금·자동 잠금, AI 전송 전 개인정보 가리기 |

```bash
npm run verify   # 타입 검사 + 테스트 56개 + 비밀값·헤더·의존성 검사
```

## 구조

```
src/
  api/          데이터 소스 (mockVehicle = 시뮬레이터, hyundaiClient = 실제 API, pleosVehicle = 차 안 Vehicle SDK)
  game/         character.ts (차 데이터 → 표정·대사), diary.ts (오늘의 일기), gpsTrip.ts (실제 GPS 주행)
  three/        3D 차량 모델 · 앞면 얼굴 스크린
  voice/        대화 AI · 음성 · 말로 하는 기능(지도·날씨·음악 등)
  components/   화면 구성 요소
  security/     기기 저장 암호화 · PIN 잠금 · 개인정보 가리기
pleos/          Pleos Connect 차 안 앱 (Android Automotive · WebView · Vehicle SDK)
api/            배포 서버 함수 (현대 OAuth · 차량 API 중계 · Gemini · Spotify)
```

## 디자인

[Figma – 우리 차가 살아있다면 App UI](https://www.figma.com/design/d391qsxYI9dMTT0ui0Py3W)

## 사용한 오픈소스 · 외부 서비스

- **Supertonic 2** (Supertone Inc.) — 한국어 음성 합성. 모델 가중치 [OpenRAIL-M](https://huggingface.co/supertone-oss-archive/supertonic-2), 추론 예제 코드 MIT. 저장소에 포함하지 않고 고정 버전(`7edbcd0`)을 브라우저에서 직접 내려받아 실행
- [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (MIT), [three.js](https://threejs.org) (MIT), React (MIT), lucide-react (ISC)
- Google Gemini API (대화 · 음성), Spotify Web API (음악 검색), Open-Meteo (날씨, CC BY 4.0), 카카오맵 · 네이버 지도 (링크)
