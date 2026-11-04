Design a polished mobile app (iPhone, 390×844) called "우리 차가 살아있다면" (If Our Car Were Alive).
All UI text must be in Korean exactly as written below.

## Concept
A car-care companion app for a Hyundai Open API contest. The user's real car becomes a cute character.
Vehicle data (battery, warning lights, trips, mileage) changes the character's mood. After every drive the car writes a short diary. Taking care of the car (fixing warnings, charging) gives XP, levels it up, and unlocks cosmetics.
Core loop: 운전 → 캐릭터 상태 변화 → 하차 시 '오늘의 일기' → 관리하면 성장 · 외형 해금

## Mascot (use the attached images)
- Attached `C_yellow_screen-face.png`: a yellow 3D toy car with a black front screen. Its face (glowing white eyes and mouth) is shown on that screen. Use this image as the hero of every screen and keep it exactly as it is. Do not redraw it.
- Attached `body.png`: the same car with a blank screen and a transparent background. Draw the face on the screen as glowing white line art (soft cyan glow). Expressions: 기본 (round eyes, small smile), 행복 (^ ^ eyes), 신남 (sparkle star eyes, open smile), 배고픔 (eyes looking up, "o" mouth, a drool drop), 아픔 (> < eyes, wavy mouth), 졸림 (closed eyes, "z z").
- The attached accessory images (crown, cap, ribbon, flower, medal) sit on the roof.

## Visual style
Modern, minimal, airy, premium but playful, like a top Dribbble app. Lots of whitespace, strict 8pt grid, 20px side margins.
- Colors: background cream #FFF8EC, surfaces #FFFFFF, text #2B2340, secondary text #8B8299, one accent warm yellow #FFC83D. Use soft pastel tints only for status: sky #E3F0FF, pink #FFE6F0, red-soft #FFECEC with red #FF6B6B for alerts, green #34C68A for good.
- Shapes: cards with 24–28px radius, very soft shadows, no heavy borders.
- Typography: titles in "Jua"; body in "Pretendard" or "Noto Sans KR"; diary text in "Gowun Dodum".
- Icons: one consistent rounded line-icon set. No emoji.
- Navigation: a floating pill tab bar at the bottom with 4 tabs: 홈, 드라이브, 일기장, 꾸미기. The active tab is a yellow pill showing its icon and label; the others show only the icon.

## Screens (make all 6, plus a component page)
1. **홈**
   - Header: "오닉이", level chip "Lv.3", thin XP bar "65/100".
   - Hero card on a soft pink gradient: the car looking sick, with the speech bubble "워셔액이 부족해요… 앞이 흐려요".
   - 3 stat tiles: 에너지 72, 건강 78, 피로도 12, each with a small ring or bar.
   - "돌봐주세요" card with one alert row: droplet icon, "워셔액 부족", the hint "앞이 잘 안 보여요…", and a red pill button "정비 완료 +20XP".
   - A small "지금 쉬는 곳 · 회사 주차장" card.
2. **드라이브 (시동 전)**
   - Title "드라이브".
   - Hero: the car on a stylized road with soft hills and clouds, with the bubble "어디로 갈까요?".
   - Segmented control "차분 / 보통 / 신나게" with 보통 selected.
   - Distance slider showing "30km".
   - Full-width yellow button "시동 걸기" with a key icon.
3. **운전 중**
   - Pink-to-cream gradient hero: the car with sparkle star eyes and motion lines, with the bubble "부릉부릉~ 바람이 시원해요!".
   - Big live stats "18.4 km" and "24분", plus a progress bar.
   - Full-width dark navy button "하차하고 오늘의 일기 보기".
4. **오늘의 일기 (bottom sheet over a dimmed screen)**
   - A soft lined notebook-page card with the happy car peeking over its top edge.
   - Date "11월 4일 화요일", title "바람 좋은 날".
   - Handwritten diary: "저녁에 주인이랑 30km를 함께 달렸다. 급브레이크 한 번 없이 부드럽게 달려서 기분이 몽글몽글했다. 지금은 회사 주차장에서 쉬는 중. 내일도 같이 달리자!"
   - Chips: "30km", "+39 XP", "회사 주차장".
   - Yellow button "일기장에 붙이기".
5. **일기장**
   - Title "일기장".
   - Week calendar strip with dots on the days the user drove.
   - Summary row: "7일 함께", "212km", "정비 3회".
   - A list of diary cards. Each card has a small square thumbnail of the car's face expression, a title, the date and distance, and a "+39 XP" tag. Titles: 바람 좋은 날, 먼 길 다녀온 날, 조금 아팠던 날, 두근두근한 날.
6. **꾸미기**
   - Title "꾸미기".
   - Large preview of the car wearing the crown on a soft yellow stage.
   - Level bar "Lv.5".
   - 3-column grid of item tiles: 왕관 (착용 중, yellow outline), 선글라스, 꽃 장식, 리본, 드라이버 캡 (locked: "누적 300km"), 정비왕 배지 (locked: "정비 3회").
   - Locked tiles are greyed out with a small lock icon.

## Components page
Build reusable components with variants: Button (Primary yellow / Dark / Secondary / Alert pill), SegmentedControl, StatTile, AlertRow, DiaryCard, ItemTile (Equipped / Unlocked / Locked), XPBar, SpeechBubble, TabBar (4 active states).
Use color and text styles for every value above.
