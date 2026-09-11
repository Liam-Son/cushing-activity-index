# 091-SPP — 엔진 설치

v3 번들을 CAI에 붙인 방식.

## 실시간 (CAI 핀치)

- id: `SPP` / 이름: `091-SPP 전력` / 가중 **0.05**
- 소스: SPP RTBM LMP-by-bus **latest interval**
- PNode: 이름에 `CUSH` · `CUSHOIL` · `PAYNE` · `STILLWATER` · `STROUD` · `OKGETIGER` · CSWS+`YALE`
- SHELL 키워드는 쓰지 않는다 (타 지역 오탐)
- 점수: 쿠싱 |MCC|의 SPP 전체 대비 백분위 60% + |MCC|/$15 절대스트레스 40%
- LMP ≈ MEC+MCC+MLC 잔차 0.05 초과 행은 버린다
- **그리드 스트레스 ≠ 펌핑.** 유가 IC는 라이브 점수에 넣지 않는다

## 연구 엔진 (이 폴더)

lookahead 없는 rolling MAD, 이벤트 클러스터, `cushing_power_factor`, circular-shift IC.
합성 유가 시리즈로 기계만 검증한다. 실측 알파가 아니다.

```
python3 test_spp_cushing_factor_engine_v3.py
```
