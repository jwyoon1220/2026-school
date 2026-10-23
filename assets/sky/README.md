# 밤하늘 데이터 출처

| 파일 | 원본 | 출처 / 크레딧 |
|---|---|---|
| `starmap_4096.webp`, `starmap_2048.webp` | `starmap_2020_4k.exr` (4096×2048, 선형 HDR) | NASA/Goddard Space Flight Center Scientific Visualization Studio, *Deep Star Maps 2020* — https://svs.gsfc.nasa.gov/4851 . 별 데이터: ESA Hipparcos-2, ESA Tycho-2, ESA/Gaia/DPAC Gaia DR2 (자료 공백은 UCAC3) |
| `moon_lroc_1k.jpg` | `lroc_color_poles_1k.jpg` | NASA's Scientific Visualization Studio, *CGI Moon Kit* — https://svs.gsfc.nasa.gov/4720 (LRO LROC) |

- 별 지도 좌표: ICRF/J2000 적경·적위, plate carrée. 중앙 = 적경 0h, 적경은 왼쪽으로 증가, 위 = 적위 +90°.
- 변환: `tools/convert_starmap.py` (EXR → sRGB 8bit WebP, 2048판은 선형 공간 2×2 평균). 원본 최댓값이 1.0이라 8bit로 손실이 작다.
- 행성 위치: NASA JPL *Approximate Positions of the Planets* Table 1 (https://ssd.jpl.nasa.gov/planets/approx_pos.html), `js/astro.js`.
- 검증: 2026-08-12 13:00 UTC 강릉(37.80N, 128.91E) 기준 JPL Horizons(DE441)와 비교해 달 약 0.12°, 행성 0.1° 이내.
