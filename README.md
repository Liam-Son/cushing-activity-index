# Cushing Activity Index v1

LS CRUDE / factor 091. Meme observer. Not alpha. Not an oil forecast.

**091-W is in.** Weight 0.05. Open-Meteo CAMS satellite AQI (no EPA station in town). Higher AQI = busier.

## Download this repo as zip
GitHub → green **Code** → **Download ZIP**
Direct: https://github.com/Liam-Son/cushing-activity-index/archive/refs/heads/main.zip

## Applied pinches
| id | w | note |
|---|---|---|
| S | 0.15 | QSR (dropped if no file) |
| U | 0.10 | jobs |
| V | 0.10 | permits |
| A | 0.05 | lodging tax |
| H | 0.05 | search |
| M | 0.05 | city packets |
| W | 0.05 | CAMS AQI |
| Z | 0.05 | 1600 KUSH news |
| ADSB | 0.05 | low-alt flights |
| CAD | 0.05 | industrial blotter |
| RADIO | 0.01 | hustle track |
| X | 0.01 | spread |
| Y | 0.01 | pump gap |

Missing pinches are **not scored 0**. Their reserved weight is redistributed.

One-file engine: `public/cfam.html`
