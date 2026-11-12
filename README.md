# 🚗 우리 차가 살아있다면

> 내 차가 말하는 캐릭터가 되어, 실제 차량 데이터에 반응하고 함께 달린 하루를 일기로 남기는 서비스
> 현대자동차그룹 차량용 앱 개발 공모전 출품작 · Pleos Connect 차량용 앱

**체험하기 → https://yooseanjay.github.io/hyundai/** (데모 모드: 차량 데이터는 시뮬레이터, 대화 AI는 실제 동작)

## 📦 공모전 제출 정보

| 항목 | 내용 |
|---|---|
| 앱 이름 | 우리 차가 살아있다면 (캐릭터: 오닉이) |
| 한 줄 소개 | 차량 데이터를 표정과 말로 바꿔, 운전 중에도 화면을 만지지 않고 내 차와 대화하며 상태 확인·음악·정비·주행 기록을 해결하는 AI 동반자 앱 |
| APK | [`apk/ysj_우리차가살아있다면_release.apk`](apk/) (release, 서명됨, 패키지 `io.github.yooseanjay.ourcaralive`, minSdk 28) |
| 개발 · 테스트 에뮬레이터 | **Pleos Connect Emulator v2.1.0** (시스템 이미지 `release_connect_v2.1.0`, Android 14 · API 34 Automotive, x86_64) |
| 화면 규격 | 기기 정의 **Pleos Connect v2.1.0**: 2560×1440 px 가로, 12.8인치. 앱 화면은 가로 **1280×720 (CSS px)** 기준으로 한 화면에 스크롤 없이 배치 |
| 사용 Pleos SDK | Vehicle 2.3.2 · 글레오 AI SpeechToText 3.3.1 · TextToSpeech 3.3.1 · LLM 2.1.3.2 (모두 On-device) — `android/` / Vehicle 2.3.2 · TextToSpeech 3.3.1 — `pleos/` |

### APK 실행 방법

1. Android Studio에서 Pleos Connect Emulator v2.1.0을 설치하고, 기기 정의 **Pleos Connect v2.1.0**으로 AVD를 만듭니다 ([설치 안내](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator)).
2. 에뮬레이터를 켠 뒤 APK를 설치합니다.
   ```bash
   adb install -r "apk/ysj_우리차가살아있다면_release.apk"
   ```
3. 앱 목록에서 **우리 차가 살아있다면**을 엽니다. 처음 말 걸기와 위치 사용 때 권한을 허용합니다.
4. 차량 값은 Pleos Connect Virtual Console에서 배터리 · 기어(P↔D) · 경고를 바꿔 보면 캐릭터 표정 · 일기에 바로 반영됩니다.

### 테스트 환경 · 필요한 설정

- **인터넷 연결 필요**: 출품 APK(`android/`)는 Kotlin 앱이 차량 SDK · 음성 SDK를 맡고, 화면(3D 차 · 대화 · 음악)은 배포된 웹 화면(`https://yooseanjay.github.io/hyundai/?pleos`)을 WebView로 엽니다.
- **API 키 불필요**: 대화 AI(Gemini)와 음악 검색은 배포 서버가 대신 호출합니다. 저장소에는 비밀값이 없습니다.
- **음성 (차 안)**: 듣기 · 대답 · 목소리 모두 현대 **글레오 AI**(Pleos SpeechToText · LLM · TextToSpeech SDK, On-device)로 처리합니다. 차에서 글레오 언어 모델을 쓸 수 없을 때만 인식된 글자를 Gemini에 보내 대답을 받습니다. 웹 화면에는 마이크 권한을 주지 않습니다.
- **SDK 저장소**: `https://nexus-playground.pleos.ai/repository/maven-releases/` (로그인 없이 받음)
- **빌드**: JDK 17, Gradle 8.10, Kotlin. `cd android && ./gradlew assembleRelease` (서명 키는 저장소 밖 `~/.gradle/gradle.properties`의 `OURCAR_*` 값을 씀. 없으면 서명 안 된 APK)
- **웹 화면만 보기**: 에뮬레이터 없이 [체험 링크](https://yooseanjay.github.io/hyundai/)를 넓은 가로 화면에서 열면 차 화면 배치로 보입니다.

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

- 대화: 차 안에서는 현대 글레오 AI 언어 모델(Pleos LLM SDK) → 안 되면 Google Gemini (서버가 대신 호출, 키는 브라우저에 오지 않음) → 그것도 안 되면 기본 대답
- 목소리: 차 안에서는 글레오 AI 목소리(Pleos TextToSpeech SDK) / 브라우저에서는 Gemini TTS (여자·남자 목소리 선택), 브라우저 안에서 도는 오픈소스 Supertonic 2

> 💻 **차 화면 미리보기**: 체험 링크를 컴퓨터 같은 넓은 가로 화면에서 열면 Pleos Connect 차 화면처럼 보입니다 (위 상태 바 · 왼쪽 메뉴 · 2열 · 아래 시스템 바). 휴대폰 배치로 보려면 주소에 `?phone`, 좁은 화면에서도 차 화면으로 보려면 `?pleos`.

## 🚘 Pleos Connect 차 안 앱 (`pleos/`)

현대자동차그룹 차량용 OS **Pleos Connect**(Android Automotive)용 **네이티브 앱**(Kotlin · Jetpack Compose). 로그인 없이 시동만 걸면 내 차가 캐릭터가 됩니다. 웹 앱과 같은 규칙(표정 · 한마디 · 오늘의 일기)을 차 안 화면에 맞게 다시 만들었습니다.

| Pleos SDK | 앱에서 |
|---|---|
| Vehicle `EvBattery` 배터리 % · 충전 중 / `Fuel` 연료 % | 배고픔 · 충전하면 "냠냠" |
| Vehicle `Odometer` 누적 주행거리 · 주행 가능 거리 | 주행 거리 · 홈 화면 수치 |
| Vehicle `Gear` P ↔ D·R·N | P에서 출발해 다시 P에 세우면 주행 1회 → 오늘의 일기 |
| Vehicle `Safety` 엔진오일 · 브레이크액 · 워셔액 부족 | 아픈 표정 · 경고 카드 |
| TextToSpeech (기기 안 모드) | 한마디를 누르면 캐릭터가 읽어 줌 |

- **화면**: 홈 · 일기 · 꾸미기. 세로 화면은 위쪽 탭, 넓은 가로 화면은 왼쪽 메뉴 + 2열. 아래쪽은 Pleos 시스템 바 자리라 비워 둠
- **주행 중 안전**: `CarUxRestrictions`를 따라 주행 중에는 큰 얼굴 · 한마디 · 주행 가능 거리만 보여 주고 버튼 · 목록 · 입력을 숨김. 움직이는 효과 없음, 주행 중에는 먼저 말 걸지 않음
- **낮 · 밤**: 시스템 설정을 따름. 글자 대비 4.5:1 이상, 큰 글자
- **읽기 전용 · 기기 안 저장**: 차 제어 기능 없음. 일기 · 꾸미기는 차 안에만 저장 (백업 끔)
- **가짜 데이터 없음**: 출시(release) 빌드는 실제 차 값만 씀. 화면 확인용 가짜 차는 debug 빌드에서, 차가 아닌 기기일 때만 동작

```bash
cd pleos
./gradlew testDebugUnitTest   # 캐릭터 · 주행 · 일기 규칙 테스트
./gradlew assembleDebug       # 폰 · 일반 에뮬레이터에서는 가짜 차로 화면 확인
./gradlew assembleRelease     # 네이티브 버전 (출품 APK는 android/ 쪽)
```

실제 차 값은 **Pleos Connect Emulator**(Android 14, API 34)나 Pleos 차에서 확인합니다. 에뮬레이터 설치와 SDK 사용 신청은 [Pleos 개발자 문서](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator) 참고. SDK(`ai.pleos.playground:Vehicle:2.3.2`, `TextToSpeech:3.3.1`, `SpeechToText:3.3.1`, `LLM:2.1.3.2`)는 공개 Maven 저장소에서 받습니다.

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
npm run verify   # 타입 검사 + 테스트 87개 + 비밀값·헤더·의존성 검사
```

## 구조

```
src/
  api/          데이터 소스 (mockVehicle = 시뮬레이터, hyundaiClient = 실제 API)
  game/         character.ts (차 데이터 → 표정·대사), diary.ts (오늘의 일기), gpsTrip.ts (실제 GPS 주행)
  three/        3D 차량 모델 · 앞면 얼굴 스크린
  voice/        대화 AI · 음성 · 말로 하는 기능(지도·날씨·음악 등)
  components/   화면 구성 요소
  security/     기기 저장 암호화 · PIN 잠금 · 개인정보 가리기
android/        출품 APK: Kotlin 차 앱 (Vehicle · 글레오 AI SpeechToText · TextToSpeech · LLM SDK) + 웹 화면 WebView
apk/            release APK
pleos/          Pleos Connect 차 안 네이티브 앱 (Kotlin · Compose · Vehicle SDK · TTS)
api/            배포 서버 함수 (현대 OAuth · 차량 API 중계 · Gemini · Spotify)
```

## 디자인

[Figma – 우리 차가 살아있다면 App UI](https://www.figma.com/design/d391qsxYI9dMTT0ui0Py3W)

## 사용한 오픈소스 · 외부 서비스

- **Supertonic 2** (Supertone Inc.) — 한국어 음성 합성. 모델 가중치 [OpenRAIL-M](https://huggingface.co/supertone-oss-archive/supertonic-2), 추론 예제 코드 MIT. 저장소에 포함하지 않고 고정 버전(`7edbcd0`)을 브라우저에서 직접 내려받아 실행
- [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (MIT), [three.js](https://threejs.org) (MIT), React (MIT), lucide-react (ISC)
- 현대 Pleos 글레오 AI SDK (차 안 듣기 · 대답 · 목소리), Google Gemini API (차 밖 대화 · 음성, 차 안 예비), Spotify Web API (음악 검색), Open-Meteo (날씨, CC BY 4.0), 카카오맵 · 네이버 지도 (링크)
