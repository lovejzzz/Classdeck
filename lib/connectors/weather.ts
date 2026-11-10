import { fetchJson } from "./safety";
import { pick } from "./declarative";
import { ConnectorError, type Connector } from "./types";

// 代码式连接器的例子：需要先把城市名换成经纬度，再查天气，一段配置写不出来。

export const weather: Connector = {
  id: "weather",
  name: "Live weather",
  description: "Current temperature, humidity, precipitation, and wind for a city (from Open-Meteo).",
  icon: "🌦️",
  kind: "builtin",
  host: "api.open-meteo.com",
  actions: [{ id: "current", title: "Get weather data", inputs: [{ name: "city", label: "City", placeholder: "e.g. Seattle" }] }],
  configured: () => true,
  async invoke(_action, input) {
    const city = (input.city ?? "").trim();
    if (!city) throw new ConnectorError("bad_input", "Enter a city");
    const geo = await fetchJson(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`,
    );
    const place = pick(geo, "results.0") as { name: string; country?: string; latitude: number; longitude: number } | undefined;
    if (!place) throw new ConnectorError("not_found", `Couldn't find “${city}”. Try another spelling.`);
    const data = await fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,precipitation,cloud_cover,wind_speed_10m&timezone=auto`,
    );
    const c = (pick(data, "current") ?? {}) as Record<string, number | string>;
    return {
      render: "table",
      columns: ["Measure", `${place.name}${place.country ? `, ${place.country}` : ""}`],
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
