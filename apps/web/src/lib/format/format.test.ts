import { describe, expect, it } from "vitest";
import { describeFailure, formatBytes, formatEta, formatSpeed } from "./format";

describe("formatBytes", () => {
  it("counts small files in bytes and larger ones in binary units", () => {
    expect(formatBytes(1)).toBe("1 byte");
    expect(formatBytes(2)).toBe("2 bytes");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(14.3 * 1024 ** 2)).toBe("14.3 MB");
    expect(formatBytes(300 * 1024 ** 2)).toBe("300 MB");
    expect(formatBytes(1.25 * 1024 ** 3)).toBe("1.3 GB");
  });
});

describe("formatSpeed", () => {
  it("drops to KB/s below 1 MB/s", () => {
    expect(formatSpeed(12.44)).toBe("12.4 MB/s");
    expect(formatSpeed(0.2)).toBe("205 KB/s");
    expect(formatSpeed(0)).toBe("—");
  });
});

describe("formatEta", () => {
  it("rounds to what a person can plan around", () => {
    expect(formatEta(20)).toBe("under a minute");
    expect(formatEta(150)).toBe("about 3 min");
    expect(formatEta(3900)).toBe("about 1 h 5 min");
    expect(formatEta(Infinity)).toBeNull();
  });
});

describe("describeFailure", () => {
  const peer = "Pixel 7";

  it("names who cancelled, from this side's point of view", () => {
    expect(describeFailure("cancelled", "sending", peer).title).toBe("You cancelled this");
    expect(describeFailure("cancelled by receiver", "sending", peer).title).toBe(
      "Pixel 7 cancelled this",
    );
    expect(describeFailure("Error: cancelled by receiver", "receiving", peer).title).toBe(
      "You cancelled this",
    );
    expect(describeFailure("Error: cancelled by sender", "receiving", peer).title).toBe(
      "Pixel 7 cancelled this",
    );
  });

  it("explains a download cancelled in the browser on either side", () => {
    expect(
      describeFailure("cancelled by receiver: download cancelled in the browser", "sending", peer)
        .title,
    ).toBe("Pixel 7 cancelled the download");
    expect(describeFailure("Error: download cancelled in the browser", "receiving", peer).title).toBe(
      "You cancelled the download",
    );
  });

  it("turns connection errors into a dropped connection with a fix", () => {
    for (const raw of ["data channel closed", "Error: peer did not reconnect", "interrupted"]) {
      expect(describeFailure(raw, "sending", peer)).toEqual({
        title: "Connection to Pixel 7 dropped",
        hint: "Keep both screens on and on the same Wi-Fi, then try again.",
      });
    }
  });

  it("keeps the raw reason as the hint when it is not recognised", () => {
    expect(describeFailure("Error: weird thing", "sending", peer)).toEqual({
      title: "Something went wrong",
      hint: "weird thing",
    });
  });
});
