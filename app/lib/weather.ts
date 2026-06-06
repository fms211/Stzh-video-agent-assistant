// 和风天气 API 服务
// 文档: https://dev.qweather.com/docs/api/

const WEATHER_KEY = "tszh_weather";
const CACHE_DURATION = 30 * 60 * 1000; // 30分钟缓存

// 和风天气配置
const QWEATHER_API_HOST = "pb5u9x7yxj.re.qweatherapi.com";
const QWEATHER_API_KEY = "9db88dc4a7fd44da846e4f53e843a495";
const QWEATHER_LOCATION_ID = "101280601"; // 深圳

export interface WeatherData {
  temp: number;        // 温度
  text: string;        // 天气描述
  icon: string;        // 天气图标代码
  humidity: number;    // 湿度
  windDir: string;     // 风向
  windScale: number;   // 风力等级
  feelsLike: number;   // 体感温度
  city: string;        // 城市名
  updateTime: number;  // 更新时间
}

// 天气图标映射（和风天气图标代码 -> emoji）
const WEATHER_ICONS: Record<string, string> = {
  "100": "☀️",   // 晴
  "101": "⛅",   // 多云
  "102": "⛅",   // 少云
  "103": "⛅",   // 晴间多云
  "104": "☁️",   // 阴
  "150": "🌙",   // 晴（夜）
  "151": "🌙",   // 多云（夜）
  "153": "🌙",   // 晴间多云（夜）
  "300": "🌧️",   // 阵雨
  "301": "🌧️",   // 阵雨
  "302": "⛈️",   // 雷阵雨
  "303": "⛈️",   // 雷阵雨
  "304": "⛈️",   // 雷阵雨伴有冰雹
  "305": "🌧️",   // 小雨
  "306": "🌧️",   // 中雨
  "307": "🌧️",   // 大雨
  "308": "🌧️",   // 暴雨
  "309": "🌧️",   // 小雨
  "310": "🌧️",   // 中雨
  "311": "🌧️",   // 大雨
  "312": "🌧️",   // 暴雨
  "313": "🌧️",   // 暴雨
  "314": "🌧️",   // 大暴雨
  "315": "🌧️",   // 大暴雨
  "316": "🌧️",   // 特大暴雨
  "317": "🌧️",   // 冻雨
  "318": "🌧️",   // 冻雨
  "399": "🌧️",   // 小雨
  "400": "❄️",   // 小雪
  "401": "❄️",   // 中雪
  "402": "❄️",   // 大雪
  "403": "❄️",   // 暴雪
  "404": "🌨️",   // 雨夹雪
  "405": "🌨️",   // 雨夹雪
  "406": "🌨️",   // 雨夹雪
  "407": "🌨️",   // 阵雪
  "408": "❄️",   // 小雪
  "409": "❄️",   // 中雪
  "410": "❄️",   // 大雪
  "499": "❄️",   // 小雪
  "500": "🌫️",   // 薄雾
  "501": "🌫️",   // 雾
  "502": "🌫️",   // 霾
  "503": "🌫️",   // 扬沙
  "504": "🌫️",   // 浮尘
  "507": "🌫️",   // 沙尘暴
  "508": "🌫️",   // 沙尘暴
  "509": "🌫️",   // 浓雾
  "510": "🌫️",   // 浓雾
  "511": "🌫️",   // 霾
  "512": "🌫️",   // 霾
  "513": "🌫️",   // 霾
  "514": "🌫️",   // 霾
  "515": "🌫️",   // 霾
  "900": "🔥",   // 热
  "901": "🥶",   // 冷
  "999": "❓",   // 未知
};

// 获取天气图标
export function getWeatherIcon(iconCode: string): string {
  return WEATHER_ICONS[iconCode] || "🌤️";
}

// 从缓存获取天气
function getCachedWeather(): WeatherData | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem(WEATHER_KEY);
    if (!cached) return null;
    const data = JSON.parse(cached);
    if (Date.now() - data.updateTime > CACHE_DURATION) return null;
    return data;
  } catch {
    return null;
  }
}

// 缓存天气数据
function cacheWeather(data: WeatherData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WEATHER_KEY, JSON.stringify(data));
}

// 获取实时天气（使用和风天气新版 API）
export async function fetchWeather(): Promise<WeatherData | null> {
  // 先检查缓存
  const cached = getCachedWeather();
  if (cached) {
    console.log("使用缓存的天气数据:", cached);
    return cached;
  }

  try {
    const url = `https://${QWEATHER_API_HOST}/v7/weather/now?location=${QWEATHER_LOCATION_ID}`;
    console.log("请求天气 API:", url);

    // 获取实时天气（新版 API 使用 Header 传递 Key）
    const res = await fetch(url, {
      headers: {
        "X-QW-Api-Key": QWEATHER_API_KEY,
      },
    });
    console.log("HTTP 状态:", res.status);
    const data = await res.json();
    console.log("天气 API 返回:", JSON.stringify(data, null, 2));

    if (data.code === "200" && data.now) {
      const weatherData: WeatherData = {
        temp: parseInt(data.now.temp),
        text: data.now.text,
        icon: data.now.icon,
        humidity: parseInt(data.now.humidity),
        windDir: data.now.windDir,
        windScale: parseInt(data.now.windScale),
        feelsLike: parseInt(data.now.feelsLike),
        city: "深圳",
        updateTime: Date.now(),
      };

      console.log("解析后的天气数据:", weatherData);
      // 缓存数据
      cacheWeather(weatherData);
      return weatherData;
    } else {
      console.error("天气 API 错误:", data.code, data);
      // 如果是授权错误，尝试使用旧版 API 格式
      if (data.code === "400" || data.code === "401" || data.code === "403") {
        console.log("尝试旧版 API 格式...");
        const oldUrl = `https://devapi.qweather.com/v7/weather/now?location=${QWEATHER_LOCATION_ID}&key=${QWEATHER_API_KEY}`;
        const oldRes = await fetch(oldUrl);
        const oldData = await oldRes.json();
        console.log("旧版 API 返回:", oldData);
      }
    }

    return null;
  } catch (error) {
    console.error("获取天气失败:", error);
    return null;
  }
}

// 获取天气描述（用于氛围效果）
export function getWeatherMood(iconCode: string): "sunny" | "cloudy" | "rainy" | "snowy" | "foggy" | "stormy" {
  const code = parseInt(iconCode);
  if (code >= 100 && code <= 103) return "sunny";
  if (code === 104 || (code >= 150 && code <= 153)) return "cloudy";
  if (code >= 300 && code <= 399) return "rainy";
  if (code >= 400 && code <= 499) return "snowy";
  if (code >= 500 && code <= 515) return "foggy";
  if (code >= 302 && code <= 304) return "stormy";
  return "sunny";
}

// 获取氛围颜色
export function getWeatherGlowColor(mood: ReturnType<typeof getWeatherMood>): string {
  switch (mood) {
    case "sunny": return "var(--glow-warm)";
    case "cloudy": return "var(--foreground-muted)";
    case "rainy": return "var(--glow-cool)";
    case "snowy": return "#e0f0ff";
    case "foggy": return "var(--glow-aurora)";
    case "stormy": return "var(--error)";
    default: return "var(--glow-warm)";
  }
}
