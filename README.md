# 🚗 우리 차가 살아있다면

> 내 차가 캐릭터가 되어, 실제 차량 데이터에 반응하고 일기를 쓰고 성장하는 서비스
> 현대자동차 Open API 공모전 출품작

## 핵심 루프

```
운전 ──▶ 캐릭터 상태 변화 ──▶ 하차 시 '오늘의 일기' ──▶ 관리(정비·충전) ──▶ 성장 · 외형 해금
  ▲                                                                              │
  └──────────────────────────────────────────────────────────────────────────────┘
```

| 차량 데이터 (Hyundai Open API) | 캐릭터 반응 |
|---|---|
| 주행 가능 거리 / 배터리 SoC | 🍙 에너지(배고픔) |
| 경고 정보 (타이어 공기압, 엔진오일, 브레이크오일, 워셔액, 램프, 스마트키) | 💖 건강, 아픈 표정과 대사 |
| 운행 정보 (거리, 시간, 평균 속도, 급제동) | 😪 피로도, 일기 내용, 경험치 |
| 누적 주행거리 | 성장 단계, 해금 조건 |
| 충전 상태 | ⚡ "냠냠" 충전 연출 |
| 주차 위치 | 📍 일기 속 장소 |

## 화면

- **홈**: 캐릭터, 상태 게이지, 돌봐주세요(경고 → 정비 시 XP), 주차 위치
- **운전**: 주행 시뮬레이터(API 승인 전 시연용) → 하차 시 일기 작성
- **일기장**: 날짜별 캐릭터 일기
- **꾸미기**: 레벨·누적 거리·정비 횟수·안전 운전으로 해금되는 외형

## 디자인

[Figma – 우리 차가 살아있다면 App UI](https://www.figma.com/design/d391qsxYI9dMTT0ui0Py3W)

- **📱 Screens**: v2 화면 6종 (홈 · 운전 전 · 운전 중 · 오늘의 일기 · 일기장 · 꾸미기) + v1 프로토타입 보관
- **🎨 Design System**: Color / Radius & Space 변수, 텍스트 스타일 8종, 컴포넌트 (Button, Chip, StatCard, CareItem, DiaryCard, ClosetTile, XPBar, SpeechBubble, TabBar)
- **🚗 Character**: 표정 7종 × 꾸미기 6종 Character 컴포넌트, 컨셉 시안

캐릭터는 3D 이미지 본체 + 앞면 스크린의 **SVG 얼굴**로 구성됩니다. 얼굴만 바꿔 표정을 만들기 때문에 생김새가 항상 일정하고, 눈 깜빡임·반짝임 같은 애니메이션이 가능합니다.
`http://localhost:5173/#moods` 에서 모든 표정과 꾸미기를 한 번에 볼 수 있습니다.

캐릭터 에셋 재생성: `python -I design/tools/prepare_character.py design/concepts/C_yellow_screen-face.png public/character`

## 실행

```bash
npm install
npm run dev     # http://localhost:5173
```

## 실제 API 연결

1. `.env.example`을 `.env.local`로 복사
2. `VITE_DATA_SOURCE=hyundai`, `VITE_HYUNDAI_CLIENT_ID` 입력
3. `src/api/hyundaiClient.ts`의 `ENDPOINTS`와 응답 필드 매핑을 developers.hyundai.com 문서에 맞게 수정
4. OAuth code → token 교환은 client secret이 필요하므로 백엔드(서버리스 함수 등)에서 처리

> ⚠️ client secret과 토큰은 절대 커밋하지 마세요. `.env.local`은 `.gitignore`에 포함되어 있습니다.

## 구조

```
src/
  api/          데이터 소스 (mockVehicle = 시뮬레이터, hyundaiClient = 실제 API)
  game/         character.ts (데이터→상태 규칙), diary.ts (일기 생성), progress.ts (XP·해금)
  components/   CarCharacter.tsx (SVG 캐릭터, 표정·액세서리)
  App.tsx       화면과 핵심 루프
```

## 다음 단계

- [ ] API 키 승인 후 실제 엔드포인트 연결과 OAuth 백엔드
- [ ] 일기를 LLM으로 생성(백엔드에서 호출)
- [ ] 운행 종료 감지 → 푸시 알림 "오늘의 일기가 도착했어요"
- [ ] 차종별 캐릭터 외형, PWA 설치 지원

## 오픈소스 음성 AI
- **Supertonic 2** (Supertone Inc.) — 한국어 남성 5종 · 여성 5종 목소리. 모델 가중치 [OpenRAIL-M](https://huggingface.co/supertone-oss-archive/supertonic-2) 라이선스, 추론 예제 코드 MIT.
- 모델은 저장소에 포함하지 않고 Hugging Face에서 고정 버전(`7edbcd0`)으로 직접 내려받아 브라우저 안에서 실행합니다 (서버·요금 없음, 처음 한 번 약 267MB).
- 실행: [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (MIT)
