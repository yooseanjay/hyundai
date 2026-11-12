# 우리 차가 살아있다면: Pleos Connect 앱

현대자동차 차 화면(Pleos Connect)에서 도는 안드로이드 앱입니다. 앱이 하는 일은 두 가지예요.

- **웹 앱 띄우기:** 배포된 웹 앱(`https://yooseanjay.github.io/hyundai/?pleos`)을 차 화면에 띄워요.
- **차와 웹 앱 잇기:** 차와 웹 앱 사이에 안전한 통로를 열어요.

| 웹 앱이 받는 것 | 어디서 |
| --- | --- |
| 배터리 · 연료 %, 주행 가능 거리, 누적 거리, 충전 상태 | Pleos **Vehicle SDK** (읽기만 함) |
| 음성 인식 (호출어 "현대", 말 걸기) | 글레오 AI **Pleos SpeechToText SDK 3.3.1** (On-device 모드: 음성이 차 밖으로 나가지 않음, 앱 등록 불필요) |
| 대답 만들기 | 글레오 AI **Pleos LLM SDK 2.1.3.2** (42dot 언어 모델, On-device). 차에서 꺼져 있으면 웹이 Gemini → 기본 대답으로 |
| 읽어 주기 | 글레오 AI **Pleos TextToSpeech SDK 3.3.1** (On-device). 차가 아닌 기기에서는 안드로이드 기본 음성 |

LLM SDK는 2026년 11월 현재 공개 사용법 문서가 없어요. 공개 Maven 저장소에 있는 SDK를 쓰고, 실제 차에서 응답하는지는 아직 확인하지 못했어요 (Pleos Connect Emulator에서는 기기 안 언어 모델이 꺼져 있다는 보고가 있어요). 그래서 실패하면 바로 다음 방법으로 넘어가요.

## 구조

```
android/app/src/main/java/io/github/yooseanjay/ourcaralive/
  MainActivity.kt   WebView, 위치 권한(우리 주소에만), 웹 화면 마이크는 막음, 바깥 링크는 바깥 앱으로
  NativeBridge.kt   웹 ↔ 차 통로 (addWebMessageListener, 우리 출처에만)
  VehicleReader.kt  Vehicle SDK 값을 3초마다 읽어 보냄 (리플렉션, 읽기 전용)
  VehicleHub.kt     Vehicle SDK 전체(19개 도메인) 함수 목록 · 부르기 · 구독 (제어는 debug 빌드만)
  CarVoice.kt       음성 인식(Pleos SpeechToText SDK) · 읽어 주기(Pleos TextToSpeech SDK)
  GleoBrain.kt      글레오 AI 대답 (Pleos LLM SDK): 웹 'llm-ask' → 'llm-result'
```

웹 쪽 짝은 `src/pleos/native.ts`예요. 차 앱 안에서 열리면 하는 일은 아래와 같아요.

- `window.SpeechRecognition`과 `speechSynthesis`를 차 음성으로 채워요. 그래서 기존 음성 코드를 그대로 써요.
- 차량 값으로 홈 화면의 배터리, 주행 가능 거리 같은 값을 덮어써요.

## 차량 SDK 콘솔 (내 기능 만들기 전 확인용)

주소에 `?vehicle`을 붙이면 차량 SDK 콘솔이 열려요. 19개 도메인(문 · 창문 · 공조 · 좌석 · 조명 · 배터리 · 와이퍼 …)의 함수를 골라 바로 **읽기 · 제어 · 구독**해 볼 수 있어요.

- **차 앱 안:** 앱이 SDK에서 실제 함수와 매개변수 모양을 읽어 와요 (`VehicleHub.kt`, 공식 예제처럼 리플렉션). 콜백과 리스너는 앱이 끼워 주니 웹은 값(자리 · 숫자 · on/off)만 넘겨요.
- **개발 서버:** `http://localhost:5174/?fakecar&vehicle` → 가짜 차(`src/pleos/fakeVehicle.ts`). 제어하면 상태가 바뀌고 구독한 곳에 변화가 와요. 범위를 벗어난 값은 실제 SDK처럼 "보냄" 뒤에 거절돼요. `&readonly`를 붙이면 제출용처럼 제어가 막혀요. 가짜 차의 매개변수 모양은 추측이에요.
- **제어 권한:** `CONTROL_CAR_*` 권한은 `src/debug/AndroidManifest.xml`에만 있어요. 개발용 debug APK만 제어하고, 제출용 release APK는 읽기 전용이에요 (`BuildConfig.VEHICLE_CONTROL`).

코드에서 쓰기 (`src/pleos/vehicle.ts`):

```ts
const s = await vehicleSchema();                                   // 도메인 · 함수 · 매개변수
await callVehicle('EvBattery', 'getEvBatteryStateOfCharge');       // 읽기 → 78
await callVehicle('HVAC', 'setHvacTemperature', ['ROW_1_LEFT', 22]); // 제어 → 'sent' (거절은 onLateError)
await callVehicle('Door', 'registerDoorLockState');                // 구독
onVehicleEvent((e) => console.log(e.domain, e.from, e.args));      // 바뀔 때마다
```

## 보안

- **통로:** 허용한 출처(`https://yooseanjay.github.io`)의 메인 프레임에만 열려요. Spotify 같은 iframe이나 다른 사이트는 통로를 볼 수 없어요.
- **권한:** 위치는 우리 주소가 요청할 때만 허락해요. 웹 화면에는 마이크를 주지 않고, 차 마이크는 SpeechToText SDK로만 써요 (글레오 언어 모델이 안 될 때만 Gemini에 인식된 글자를 보냄). 차량 권한은 제출용(release)에는 읽기 권한만 넣고, 제어 권한은 개발용(debug) 빌드에만 넣어요.
- **WebView:** http, 파일, 콘텐츠 접근을 막았어요. 우리 주소가 아닌 링크는 바깥 앱으로 열어요.

## 빌드 · 실행

준비물은 다음과 같아요.

- **개발 도구:** Android Studio(JDK 17 포함)
- **에뮬레이터:** Pleos Connect Emulator 2.1.0 (Android API 34). [설치 안내](https://document.pleos.ai/en/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator)를 따라 SDK Manager에 아래 주소를 추가해요.
  - Windows / Linux: `https://nexus-playground.pleos.ai/repository/raw-releases/connect-avd/2.x/crp-sys-img.xml`

실행 순서예요.

1. Android Studio에서 `android/` 폴더를 열어요. Gradle Wrapper가 없으면 Studio가 만들어 줘요.
2. Device Manager에서 Automotive 기기를 고르고 Pleos Connect v2.1.0으로 에뮬레이터를 만들어요. RAM은 4 GB, 부팅은 Cold로 해요.
3. 실행(▶)해요.

다른 주소를 열어 보려면 이렇게 실행해요.

```bash
./gradlew installDebug -PappUrl=https://yooseanjay.github.io/hyundai/?pleos
```

실제 차에서 시험하거나 앱 마켓에 올리려면 [Pleos Playground](https://pleos.ai/playground)에 가입해야 해요. 가입은 직접 하세요. 가입한 다음 순서예요.

1. 프로젝트를 만들어요.
2. 필요한 SDK를 신청해요. Vehicle은 바로 쓸 수 있어요.
3. App Market Console에서 심사를 요청해요.
