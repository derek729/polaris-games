# Lbox Lite 게임 컬렉션 분석 보고서

> 2026-10-24 조사 · `/media/derek/Lbox Lite` (LaunchBox 드라이브, 총 466GB)
> REA + 파일 시그니처 분석 · 목적: 일일 게임 파이프라인의 참고 소스 확보

---

## 1. 컬렉션 개요

LaunchBox(레트로 에뮬레이터 런처) 기반 컬렉션. 게임 본체는
`Open'launchbox.exe'/games/` 하위에 14개 플랫폼으로 구성.

| 플랫폼 | 타이틀 수 | 용량 | 형식 | 참고 가치 |
|---|---|---|---|---|
| **nes** | 2,015 | 216M | zip | ★★★ 2D 메커니즘 원형의 보고 |
| **snes** | 771 | 628M | zip | ★★★ 발전형 2D 설계 |
| **megadrive** | 757 | 670M | zip | ★★★ 속도감·액션 설계 |
| n64 | 465 | 5.3G | zip | ★★ 3D 초기 설계 |
| ps1 | 98 | 30G | chd | ★★ |
| ps2 | 51 | 94G | chd | ★ |
| ps3 / ps4 | 덤프 산물 | 23G / 116G | bik/ipk/ws | ☆ 미완 덤프, 참고 가치 낮음 |
| gamecube / wii / wiiu / switch | 54 | 101G | gcz/wbfs/wux/nsp | ★ |
| **win (PC 게임)** | **9종** | 23G | exe/pck/dll | ★★★ 엔진 구성 직접 분석 대상 |

에뮬레이터 7종 동봉: RetroArch, Dolphin, PCSX2, PPSSPP, RPCS3, Yuzu, Cemu —
전 플랫폼 실행 환경 갖춰짐. Images 9.7GB(커버 아트), Data 19M(게임 메타데이터 XML).

## 2. PC 게임 9종 — 엔진 감별 (REA + 시그니처)

| 게임 | 장르 | 엔진 | 근거 | REA 증거 |
|---|---|---|---|---|
| **Vampire Survivors** | 뱀서라이크 | **Unity IL2CPP** | GameAssembly.dll + UnityPlayer.dll | ev_fc1c40d0 (PE x64 확인) |
| **Brotato** | 아레나 서바이버 로그라이트 | **Godot** | .pck 패키지 + GodotWorkshopUtility | ev_f0835ce3 |
| DAVE THE DIVER | 어부·경영 어드벤처 | **Unity IL2CPP** | GameAssembly.dll | (시그니처) |
| Dead Cells | 로그라이크 액션 | **Heaps(Haxe)+SDL2** | SDL2.dll, 커스텀 바이너리 | (시그니처) |
| FF IV/V/VI Pixel Remaster | RPG | Unity | 빌드 구조 | (시그니처) |
| Double Dragon Gaiden | 록맨식 로그라이트 beat'em up | Unity | 빌드 구조 | (시그니처) |
| Flippin Kaktus | 액션 | 미확인 | — | — |

> 비고: Brotato `rea analyze`는 자동탐지가 JS 프로바이더로 잘못 라우팅함 —
> Godot .pck는 전용 명령이 아닌 artifact-inventory 경로로 접근 필요(개선 과제).
> GameAssembly.dll은 네이티브 PE(0x8664)로 확인 — managed 검사기로는 메타데이터
> 일부만 접근 가능하며, 본격 디컴파일은 Ghidra 경로(REA decompile)로 시간이 많이 든다.

## 3. 클래식 프랜차이즈 카탈로그 (우리 파이프라인 직결)

25개 장르 정의 프랜차이즈, 총 190여 타이틀 확인:

| 프랜차이즈(타이틀 수) | 우리가 배울 메커니즘 | 우리 게임과의 접점 |
|---|---|---|
| Super Mario (19) | 점프 곡선·관성 이동 | 함정의 방, 플랫포머 후보 |
| Sonic (16) | 속도 가속·경사 물리 | 힐 드라이버 |
| Zelda (14) | 아이템 게이트 설계 | — |
| Mega Man/Rockman (22) | 선택 스테이지·보스 패턴 | 함정의 방 확장 |
| Donkey Kong (13) | 단계별 긴장 상승 | — |
| Double Dragon (12) | beat'em up 콤보 | BeatCraft/DD 계열 |
| Kirby (10) | 흡수·복사 능력 | 블롭 왕 변형 |
| Tetris (9) | 낙하 퍼즐 루프 | 4일차 후보 |
| Street Fighter (9) | 판정 프레임·콤보 | infinity-blade-duel |
| Castlevania (9) | 서브웨이핑 무기 | — |
| Contra (8) | run&gun 난이도 곡선 | run&gun 후보 |
| Pac-Man (5) | 미로 AI(4고스트 성격) | 미로 후보 |
| Bomberman (5) | 폭파 범위 판정 | 폭탄 퍼즐 후보 |
| Bubble Bobble (5) | 버블 가두기 | — |
| Ninja Gaiden (5) | 벽점프·필살 | 함정의 방 2 |
| Gradius/Twinbee/1942 (8) | 슈팅 파워업 곡선 | 종스크롤 슈팅 후보 |
| Arkanoid (3) | 반사각·아이템 드롭 | 브레이크아웃(2일차) |
| Puyo (2) | 연쇄 퍼즐 | 퍼즐 후보 |
| Final Fight(6)·Ghosts(3)·Road Rash(2)·F-Zero(1) | 각 장르 원형 | — |

## 4. 라이선스 경계 (반드시 지킬 것)

- **ROM/ISO/게임 본체 파일은 저작물** — 에셋 추출·복사·재배포 금지.
- 우리 파이프라인은 기존 원칙대로 **메커니즘·규칙·설계만 참조**해 자체 구현
  (docs/오픈소스게임-에셋활용후보.md §0 준용).
- LaunchBox·에뮬레이터 자체는 무료 소프트웨어 — 개인 실행 환경으로만 사용.
- PC 게임 9종은 상업 게임 — 코드 리딩은 학습 목적 개인 범위, 산출물 반출 금지.

## 5. 결론 — 개발 가능 목록 (우리 파이프라인 반영)

### 즉시 가능 (기존 파이프라인에 바로 투입)
1. **브로타토 류 아레나 서바이버** — 우리 뱀파이어 키우기의 자산(스프라이트·무기
   체계)을 재활용한 20초 웨이브 아레나. 레퍼런스: Brotato(Godot) 관찰
2. **테트리스 류** — 컬렉션 Tetris 9종 메커니즘 + jakesgordon MIT 레퍼런스 병행
3. **콘트라 류 run&gun** — 8방향 조준·웨이브 난이도(컬렉션 Contra 8종 참조)
4. **그라디우스 류 종스크롤 슈팅** — 파워업 캡슐 곡선(Gradius 4종+Twinbee 3종)
5. **팩맨 류 미로 체이스** — 4고스트 성격 AI(쫓기/매복/산책/후방)

### 중기 (2~3일 규모)
6. **캐슬바니아 류 사이드스크롤 액션** — 서브무기·보스 룸 구성
7. **버블보블 류 협동 퍼즐** — 버블 가두기+틈타이 판정
8. **소닉 류 속도 러너** — 경사 가속 물리(힐 드라이버 물리 재활용)

### 참고만 하는 것
- Vampire Survivors/Brotato: 우리 게임(뱀파이어 키우기)의 밸런스·업그레이드
  구조 관찰용. 코드·에셋 비의존.
- Dead Cells(Heaps): "셀 오토마타 느낌의 유기적 맵" 아이디어만 참고.
