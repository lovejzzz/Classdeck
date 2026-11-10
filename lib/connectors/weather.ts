import { fetchJson } from "./safety";
import { pick } from "./declarative";
import { ConnectorError, type Connector } from "./types";

// 代码式连接器的例子：需要先把城市名换成经纬度，再查天气，一段配置写不出来。

const WMO: Record<number, string> = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Showers", 81: "Showers", 82: "Heavy showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm", 96: "Thunderstorm, hail", 99: "Thunderstorm, hail",
};

async function locate(city: string) {
  const geo = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`);
  const place = pick(geo, "results.0") as { name: string; country?: string; latitude: number; longitude: number } | undefined;
  if (!place) throw new ConnectorError("not_found", `Couldn't find “${city}”. Try another spelling.`);
  return { ...place, label: `${place.name}${place.country ? `, ${place.country}` : ""}` };
}

const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const clock = (iso: string) => iso.slice(11, 16);

export const weather: Connector = {
  id: "weather",
  name: "Live weather",
  description: "Current conditions, a 7-day forecast, and sunrise and daylight for any city (from Open-Meteo).",
  icon: "🌦️",
  kind: "builtin",
  category: "Science & data",
  host: "api.open-meteo.com",
  actions: [
    { id: "current", title: "Get weather data", inputs: [{ name: "city", label: "City", placeholder: "e.g. Seattle" }] },
    { id: "forecast", title: "7-day forecast", inputs: [{ name: "city", label: "City", placeholder: "e.g. Nairobi" }] },
    { id: "sun", title: "Sunrise and daylight", inputs: [{ name: "city", label: "City", placeholder: "e.g. Reykjavik" }] },
  ],
  configured: () => true,
  async invoke(action, input) {
    const city = (input.city ?? "").trim();
    if (!city) throw new ConnectorError("bad_input", "Enter a city");
    const place = await locate(city);
    const at = `latitude=${place.latitude}&longitude=${place.longitude}&timezone=auto`;
    if (action === "forecast" || action === "sun") {
      const fields = action === "forecast" ? "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" : "sunrise,sunset,daylight_duration";
      const data = await fetchJson(`https://api.open-meteo.com/v1/forecast?${at}&daily=${fields}&forecast_days=7`);
      const d = (pick(data, "daily") ?? {}) as Record<string, (string | number)[]>;
      const days = (d.time ?? []) as string[];
      if (action === "forecast") {
        return {
          render: "table", columns: [place.label, "Sky", "High / low", "Rain chance"],
          rows: days.map((t, i) => [day(t), WMO[d.weather_code[i] as number] ?? "—", `${Math.round(d.temperature_2m_max[i] as number)}° / ${Math.round(d.temperature_2m_min[i] as number)}°C`, `${d.precipitation_probability_max[i] ?? 0}%`]),
        };
      }
      return {
        render: "table", columns: [place.label, "Sunrise", "Sunset", "Daylight"],
        rows: days.map((t, i) => {
          const sec = d.daylight_duration[i] as number;
          return [day(t), clock(d.sunrise[i] as string), clock(d.sunset[i] as string), `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min`];
        }),
      };
    }
    const data = await fetchJson(
      `https://api.open-meteo.com/v1/forecast?${at}&current=temperature_2m,relative_humidity_2m,precipitation,cloud_cover,wind_speed_10m`,
    );
    const c = (pick(data, "current") ?? {}) as Record<string, number | string>;
    return {
      render: "table",
      columns: ["Measure", place.label],
      rows: [
        ["Temperature", `${c.temperature_2m} °C`],
        ["Relative humidity", `${c.relative_humidity_2m} %`],
        ["Precipitation", `${c.precipitation} mm`],
        ["Cloud cover", `${c.cloud_cover} %`],
        ["Wind speed", `${c.wind_speed_10m} km/h`],
        ["Observed at", String(c.time ?? "").replace("T", " ")],
      ],
    };
  },
};
