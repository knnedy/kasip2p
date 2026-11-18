import { describe, expect, it } from "vitest";
import { defaultDeviceName } from "./default-name";

const ua = {
  pixel: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36",
  reducedAndroid: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",
  ubuntu: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
};

describe("defaultDeviceName", () => {
  it("uses the phone model when the browser reveals it", () => {
    expect(defaultDeviceName(ua.pixel)).toBe("Pixel 7");
  });

  it("falls back to a plain description, never a raw platform string", () => {
    expect(defaultDeviceName(ua.reducedAndroid)).toBe("Android phone");
    expect(defaultDeviceName(ua.androidTablet)).toBe("Android tablet");
    expect(defaultDeviceName(ua.iphone)).toBe("iPhone");
    expect(defaultDeviceName(ua.mac)).toBe("Mac");
    expect(defaultDeviceName(ua.windows)).toBe("Windows PC");
    expect(defaultDeviceName(ua.linux)).toBe("Linux computer");
    expect(defaultDeviceName(ua.ubuntu)).toBe("Ubuntu computer");
    expect(defaultDeviceName("")).toBe("This device");
  });
});
